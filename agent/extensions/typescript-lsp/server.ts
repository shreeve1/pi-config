import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import {
  DiagnosticSeverity,
  type Hover,
  type Location,
  type LocationLink,
  type CompletionItem,
  type CompletionList,
  type DocumentDiagnosticReport,
  type Diagnostic,
  type PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";

// --- Types ---
export interface LspDiagnostic {
  file: string;
  line: number;
  character: number;
  severity: "error" | "warning" | "info" | "hint";
  code: string | number | undefined;
  message: string;
}

export interface LspHoverResult {
  contents: string;
  range?: { startLine: number; startChar: number; endLine: number; endChar: number };
}

export interface LspLocation {
  file: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}

export interface LspCompletionItem {
  label: string;
  kind: string;
  detail?: string;
  documentation?: string;
}

// --- File URI helpers ---
function fileUri(filePath: string): string {
  const abs = resolve(filePath);
  return `file://${abs}`;
}

function uriToPath(uri: string): string {
  return uri.replace("file://", "");
}

// --- Find tsconfig ---
function findTsconfigDir(filePath: string): string {
  let dir = dirname(resolve(filePath));
  while (dir !== "/") {
    if (existsSync(resolve(dir, "tsconfig.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(resolve(filePath));
}

// --- Severity mapping ---
function severityString(severity: DiagnosticSeverity | undefined): "error" | "warning" | "info" | "hint" {
  switch (severity) {
    case DiagnosticSeverity.Error: return "error";
    case DiagnosticSeverity.Warning: return "warning";
    case DiagnosticSeverity.Information: return "info";
    case DiagnosticSeverity.Hint: return "hint";
    default: return "error";
  }
}

// --- Completion kind mapping ---
const COMPLETION_KINDS: Record<number, string> = {
  1: "Text", 2: "Method", 3: "Function", 4: "Constructor", 5: "Field",
  6: "Variable", 7: "Class", 8: "Interface", 9: "Module", 10: "Property",
  11: "Unit", 12: "Value", 13: "Enum", 14: "Keyword", 15: "Snippet",
  16: "Color", 17: "File", 18: "Reference", 19: "Folder", 20: "EnumMember",
  21: "Constant", 22: "Struct", 23: "Event", 24: "Operator", 25: "TypeParameter",
};

// --- LSP Server Manager ---
export class TypeScriptLspServer {
  private process: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private initialized = false;
  private rootDir: string | null = null;
  private openFiles = new Map<string, number>(); // uri -> version
  private diagnosticsMap = new Map<string, Diagnostic[]>(); // uri -> diagnostics

  /**
   * Ensure the server is running and initialized for a given file.
   * Lazy-starts the server on first call.
   */
  async ensureRunning(filePath: string): Promise<void> {
    const projectDir = findTsconfigDir(filePath);

    // If server is running for a different root, restart
    if (this.initialized && this.rootDir !== projectDir) {
      await this.shutdown();
    }

    if (!this.initialized) {
      await this.start(projectDir);
    }
  }

  /**
   * Start the LSP server for a given project root.
   */
  private async start(rootDir: string): Promise<void> {
    this.rootDir = rootDir;

    // Resolve the typescript-language-server binary from our local node_modules
    const extensionDir = dirname(new URL(import.meta.url).pathname);
    const tslsBin = resolve(extensionDir, "node_modules", ".bin", "typescript-language-server");

    this.process = spawn(tslsBin, ["--stdio"], {
      cwd: rootDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error("Failed to spawn typescript-language-server");
    }

    this.connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin),
    );

    // Listen for push diagnostics
    this.connection.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
      this.diagnosticsMap.set(params.uri, params.diagnostics);
    });

    this.connection.listen();

    // Handle unexpected exit
    this.process.on("exit", () => {
      this.initialized = false;
      this.connection = null;
      this.process = null;
      this.openFiles.clear();
      this.diagnosticsMap.clear();
    });

    // Initialize handshake
    const initParams = {
      processId: process.pid,
      rootUri: fileUri(rootDir),
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          completion: {
            completionItem: {
              snippetSupport: false,
              documentationFormat: ["plaintext"],
            },
          },
          hover: {
            contentFormat: ["plaintext", "markdown"],
          },
          definition: {},
          references: {},
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      workspaceFolders: [
        { uri: fileUri(rootDir), name: rootDir.split("/").pop() ?? "workspace" },
      ],
    };

    await this.connection.sendRequest("initialize", initParams);
    this.connection.sendNotification("initialized", {});
    this.initialized = true;
  }

  /**
   * Ensure a file is opened in the LSP with current contents.
   */
  async openFile(filePath: string, content?: string): Promise<void> {
    if (!this.connection || !this.initialized) return;

    const uri = fileUri(filePath);

    if (this.openFiles.has(uri)) return;

    const text = content ?? readFileSync(resolve(filePath), "utf-8");
    this.openFiles.set(uri, 1);

    this.connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: filePath.endsWith(".tsx") ? "typescriptreact" : "typescript",
        version: 1,
        text,
      },
    });
  }

  /**
   * Notify the LSP that a file's content has changed.
   * Uses full-content sync (TextDocumentSyncKind.Full).
   */
  async updateFile(filePath: string, content: string): Promise<void> {
    if (!this.connection || !this.initialized) return;

    const uri = fileUri(filePath);

    if (!this.openFiles.has(uri)) {
      await this.openFile(filePath, content);
      return;
    }

    const version = (this.openFiles.get(uri) ?? 1) + 1;
    this.openFiles.set(uri, version);

    this.connection.sendNotification("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }

  /**
   * Get diagnostics for a file. Waits briefly for push diagnostics.
   */
  async getDiagnostics(filePath: string, timeoutMs = 3000): Promise<LspDiagnostic[]> {
    if (!this.connection || !this.initialized) return [];

    const uri = fileUri(filePath);

    // Try pull diagnostics first
    try {
      const result = await Promise.race([
        this.connection.sendRequest("textDocument/diagnostic", {
          textDocument: { uri },
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), timeoutMs)
        ),
      ]) as DocumentDiagnosticReport | null;

      if (result && "items" in result && result.items.length > 0) {
        return result.items.map((d: Diagnostic) => ({
          file: filePath,
          line: d.range.start.line + 1,
          character: d.range.start.character + 1,
          severity: severityString(d.severity),
          code: typeof d.code === "object" ? d.code?.value : d.code,
          message: d.message,
        }));
      }
    } catch {
      // Pull diagnostics not supported or timed out — fall through to push diagnostics
    }

    // Fall back to push diagnostics (cached from onNotification)
    // Wait a bit for diagnostics to arrive
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 1500)));

    const pushDiags = this.diagnosticsMap.get(uri) ?? [];
    return pushDiags.map((d) => ({
      file: filePath,
      line: d.range.start.line + 1,
      character: d.range.start.character + 1,
      severity: severityString(d.severity),
      code: typeof d.code === "object" ? d.code?.value : d.code,
      message: d.message,
    }));
  }

  /**
   * Get all diagnostics across all open files.
   */
  async getAllDiagnostics(timeoutMs = 10000): Promise<LspDiagnostic[]> {
    if (!this.connection || !this.initialized) return [];

    // Wait for diagnostics to propagate
    await new Promise((r) => setTimeout(r, 2000));

    const all: LspDiagnostic[] = [];
    for (const [uri, diags] of this.diagnosticsMap) {
      const file = uriToPath(uri);
      for (const d of diags) {
        all.push({
          file,
          line: d.range.start.line + 1,
          character: d.range.start.character + 1,
          severity: severityString(d.severity),
          code: typeof d.code === "object" ? d.code?.value : d.code,
          message: d.message,
        });
      }
    }
    return all;
  }

  /**
   * Get hover info at a position.
   */
  async hover(filePath: string, line: number, character: number): Promise<LspHoverResult | null> {
    if (!this.connection || !this.initialized) return null;

    await this.ensureRunning(filePath);
    await this.openFile(filePath);

    const result = await this.connection.sendRequest("textDocument/hover", {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character: character - 1 },
    }) as Hover | null;

    if (!result) return null;

    let contents: string;
    if (typeof result.contents === "string") {
      contents = result.contents;
    } else if ("value" in result.contents) {
      contents = result.contents.value;
    } else if (Array.isArray(result.contents)) {
      contents = result.contents
        .map((c) => (typeof c === "string" ? c : c.value))
        .join("\n\n");
    } else {
      contents = String(result.contents);
    }

    return {
      contents,
      range: result.range
        ? {
            startLine: result.range.start.line + 1,
            startChar: result.range.start.character + 1,
            endLine: result.range.end.line + 1,
            endChar: result.range.end.character + 1,
          }
        : undefined,
    };
  }

  /**
   * Go to definition.
   */
  async definition(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    if (!this.connection || !this.initialized) return [];

    await this.ensureRunning(filePath);
    await this.openFile(filePath);

    const result = await this.connection.sendRequest("textDocument/definition", {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character: character - 1 },
    }) as Location | Location[] | LocationLink[] | null;

    if (!result) return [];

    const locations = Array.isArray(result) ? result : [result];
    return locations.map((loc) => {
      if ("targetUri" in loc) {
        // LocationLink
        return {
          file: uriToPath(loc.targetUri),
          line: loc.targetRange.start.line + 1,
          character: loc.targetRange.start.character + 1,
          endLine: loc.targetRange.end.line + 1,
          endCharacter: loc.targetRange.end.character + 1,
        };
      } else {
        // Location
        return {
          file: uriToPath(loc.uri),
          line: loc.range.start.line + 1,
          character: loc.range.start.character + 1,
          endLine: loc.range.end.line + 1,
          endCharacter: loc.range.end.character + 1,
        };
      }
    });
  }

  /**
   * Find all references.
   */
  async references(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    if (!this.connection || !this.initialized) return [];

    await this.ensureRunning(filePath);
    await this.openFile(filePath);

    const result = await this.connection.sendRequest("textDocument/references", {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character: character - 1 },
      context: { includeDeclaration: true },
    }) as Location[] | null;

    if (!result) return [];

    return result.map((loc) => ({
      file: uriToPath(loc.uri),
      line: loc.range.start.line + 1,
      character: loc.range.start.character + 1,
      endLine: loc.range.end.line + 1,
      endCharacter: loc.range.end.character + 1,
    }));
  }

  /**
   * Get completions at a position.
   */
  async completions(filePath: string, line: number, character: number): Promise<LspCompletionItem[]> {
    if (!this.connection || !this.initialized) return [];

    await this.ensureRunning(filePath);
    await this.openFile(filePath);

    const result = await this.connection.sendRequest("textDocument/completion", {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character: character - 1 },
    }) as CompletionList | CompletionItem[] | null;

    if (!result) return [];

    const items = Array.isArray(result) ? result : result.items;
    return items.slice(0, 50).map((item) => ({
      label: item.label,
      kind: COMPLETION_KINDS[item.kind ?? 1] ?? "Unknown",
      detail: item.detail,
      documentation:
        typeof item.documentation === "string"
          ? item.documentation
          : item.documentation?.value,
    }));
  }

  /**
   * Shut down the LSP server cleanly.
   */
  async shutdown(): Promise<void> {
    if (this.connection && this.initialized) {
      try {
        await Promise.race([
          this.connection.sendRequest("shutdown"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
        this.connection.sendNotification("exit");
      } catch {
        // Server already dead
      }
    }

    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Already exited
      }
    }

    this.connection?.dispose();
    this.connection = null;
    this.process = null;
    this.initialized = false;
    this.rootDir = null;
    this.openFiles.clear();
    this.diagnosticsMap.clear();
  }

  /**
   * Check if server is currently running.
   */
  isRunning(): boolean {
    return this.initialized && this.process !== null;
  }
}
