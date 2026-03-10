# TypeScript LSP Extension — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a pi extension that integrates TypeScript Language Server Protocol support — auto-injected diagnostics after edits, plus on-demand tools for type inspection and code navigation.

**Architecture:** A directory-based extension (`typescript-lsp/`) that spawns `typescript-language-server` over stdio, communicates via JSON-RPC using `vscode-jsonrpc`, and hooks into pi's `tool_result` event to auto-inject diagnostics after `.ts`/`.tsx` edits.

**Tech Stack:** `typescript-language-server`, `vscode-jsonrpc`, `vscode-languageserver-protocol`, `typescript`

---

### Task 1: Scaffold the extension directory

**Files:**
- Create: `~/.pi/agent/extensions/typescript-lsp/package.json`
- Create: `~/.pi/agent/extensions/typescript-lsp/index.ts` (placeholder)

**Step 1: Create the package.json**

Create `~/.pi/agent/extensions/typescript-lsp/package.json`:

```json
{
  "name": "pi-typescript-lsp",
  "private": true,
  "type": "module",
  "dependencies": {
    "typescript": "^5.9.3",
    "typescript-language-server": "^5.1.3",
    "vscode-jsonrpc": "^8.2.1",
    "vscode-languageserver-protocol": "^3.17.5"
  }
}
```

**Step 2: Create placeholder index.ts**

Create `~/.pi/agent/extensions/typescript-lsp/index.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // LSP tools and hooks registered in subsequent tasks
}
```

**Step 3: Install dependencies**

Run: `cd ~/.pi/agent/extensions/typescript-lsp && npm install`
Expected: `node_modules/` created with all dependencies

**Step 4: Commit**

```bash
cd ~/.pi/agent
git add extensions/typescript-lsp/package.json extensions/typescript-lsp/package-lock.json extensions/typescript-lsp/index.ts
git commit -m "chore: scaffold typescript-lsp extension with deps"
```

---

### Task 2: Implement the LSP server manager

**Files:**
- Create: `~/.pi/agent/extensions/typescript-lsp/server.ts`

This module manages the `typescript-language-server` subprocess — spawning, initializing the LSP handshake, sending requests/notifications, and shutting down. It uses `vscode-jsonrpc` for the JSON-RPC transport and `vscode-languageserver-protocol` for typed LSP messages.

**Step 1: Write server.ts**

Create `~/.pi/agent/extensions/typescript-lsp/server.ts`:

```typescript
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
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  HoverRequest,
  DefinitionRequest,
  ReferencesRequest,
  CompletionRequest,
  DocumentDiagnosticRequest,
  TextDocumentSyncKind,
  type InitializeParams,
  type Hover,
  type Location,
  type LocationLink,
  type CompletionItem,
  type CompletionList,
  type DocumentDiagnosticReport,
  type Diagnostic,
  type PublishDiagnosticsParams,
  DiagnosticSeverity,
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
    const tslsBin = resolve(dirname(import.meta.url.replace("file://", "")), "node_modules", ".bin", "typescript-language-server");

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
    const initParams: InitializeParams = {
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

    await this.connection.sendRequest(InitializeRequest.type, initParams);
    this.connection.sendNotification(InitializedNotification.type, {});
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

    this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
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

    this.connection.sendNotification(DidChangeTextDocumentNotification.type, {
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
        this.connection.sendRequest(DocumentDiagnosticRequest.type, {
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

    const result = await this.connection.sendRequest(HoverRequest.type, {
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

    const result = await this.connection.sendRequest(DefinitionRequest.type, {
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

    const result = await this.connection.sendRequest(ReferencesRequest.type, {
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

    const result = await this.connection.sendRequest(CompletionRequest.type, {
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
          this.connection.sendRequest(ShutdownRequest.type),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
        this.connection.sendNotification(ExitNotification.type);
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
```

**Step 2: Verify it compiles (basic check)**

Run: `cd ~/.pi/agent/extensions/typescript-lsp && npx tsc --noEmit --moduleResolution bundler --module ESNext --target ES2020 --strict --skipLibCheck server.ts`
Expected: No errors (or only minor type-resolution warnings that jiti handles)

**Step 3: Commit**

```bash
cd ~/.pi/agent
git add extensions/typescript-lsp/server.ts
git commit -m "feat: add TypeScript LSP server manager"
```

---

### Task 3: Implement the auto-inject diagnostics hook

**Files:**
- Modify: `~/.pi/agent/extensions/typescript-lsp/index.ts`

This hooks into `tool_result` for `edit` and `write` tools. When the target file is `.ts`/`.tsx`, it lazy-starts the LSP server, sends the file update, gets diagnostics, and appends them to the tool result.

**Step 1: Write the tool_result hook in index.ts**

Overwrite `~/.pi/agent/extensions/typescript-lsp/index.ts` with:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  isEditToolResult,
  isWriteToolResult,
} from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TypeScriptLspServer } from "./server.js";

const TS_EXTENSIONS = [".ts", ".tsx"];

function isTypeScriptFile(path: string): boolean {
  return TS_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export default function (pi: ExtensionAPI) {
  const lsp = new TypeScriptLspServer();

  // Shut down LSP on session end
  pi.on("session_shutdown", async () => {
    await lsp.shutdown();
  });

  // Auto-inject diagnostics after edit/write on .ts/.tsx files
  pi.on("tool_result", async (event, ctx) => {
    let filePath: string | undefined;

    if (isEditToolResult(event)) {
      filePath = (event.input as { path?: string }).path;
    } else if (isWriteToolResult(event)) {
      filePath = (event.input as { path?: string }).path;
    }

    if (!filePath || !isTypeScriptFile(filePath)) return;
    if (event.isError) return;

    try {
      const absPath = resolve(ctx.cwd, filePath);

      // Ensure server is running for this file's project
      await lsp.ensureRunning(absPath);

      // Read current file content and update LSP
      const content = readFileSync(absPath, "utf-8");
      await lsp.updateFile(absPath, content);

      // Get diagnostics (3s timeout)
      const diagnostics = await lsp.getDiagnostics(absPath, 3000);

      if (diagnostics.length === 0) return;

      // Format diagnostics
      const errors = diagnostics.filter((d) => d.severity === "error");
      const warnings = diagnostics.filter((d) => d.severity === "warning");
      const others = diagnostics.filter((d) => d.severity !== "error" && d.severity !== "warning");

      const counts: string[] = [];
      if (errors.length > 0) counts.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`);
      if (warnings.length > 0) counts.push(`${warnings.length} warning${warnings.length > 1 ? "s" : ""}`);
      if (others.length > 0) counts.push(`${others.length} info`);

      const header = `\n\n[TypeScript: ${counts.join(", ")}]`;
      const lines = diagnostics.map((d) => {
        const code = d.code ? ` TS${d.code}` : "";
        return `  ${d.file}:${d.line}:${d.character} - ${d.severity}${code}: ${d.message}`;
      });

      const diagnosticText = header + "\n" + lines.join("\n");

      // Append to tool result content
      const existingText = event.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");

      return {
        content: [{ type: "text", text: existingText + diagnosticText }],
      };
    } catch {
      // LSP not available or errored — don't block the tool result
      return;
    }
  });

  // On-demand tools registered in Task 4
}
```

**Step 2: Commit**

```bash
cd ~/.pi/agent
git add extensions/typescript-lsp/index.ts
git commit -m "feat: auto-inject TypeScript diagnostics after edit/write"
```

---

### Task 4: Implement the on-demand tools

**Files:**
- Modify: `~/.pi/agent/extensions/typescript-lsp/index.ts`

Add the five on-demand tools: `ts_diagnostics`, `ts_hover`, `ts_definition`, `ts_references`, `ts_completions`.

**Step 1: Add on-demand tools**

Add the following code inside the `export default function` block in `index.ts`, after the `tool_result` hook and replacing the `// On-demand tools registered in Task 4` comment:

```typescript
  // ==================== ts_diagnostics ====================
  pi.registerTool({
    name: "ts_diagnostics",
    label: "TS Diagnostics",
    description: "Get TypeScript diagnostics (errors, warnings) for a file or the whole project. Useful to check if code compiles correctly.",
    parameters: Type.Object({
      file: Type.Optional(
        Type.String({ description: "File path to check. Omit for all open files." }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { file } = params as { file?: string };

      try {
        if (file) {
          const absPath = resolve(ctx.cwd, file);
          if (!isTypeScriptFile(absPath)) {
            return {
              content: [{ type: "text", text: `Not a TypeScript file: ${file}` }],
              isError: true,
            };
          }

          await lsp.ensureRunning(absPath);
          await lsp.openFile(absPath);
          const diagnostics = await lsp.getDiagnostics(absPath, 10000);

          if (diagnostics.length === 0) {
            return { content: [{ type: "text", text: `✓ No issues in ${file}` }] };
          }

          return { content: [{ type: "text", text: formatDiagnostics(diagnostics) }] };
        } else {
          // All open files
          const diagnostics = await lsp.getAllDiagnostics(10000);

          if (diagnostics.length === 0) {
            return { content: [{ type: "text", text: "✓ No TypeScript issues found" }] };
          }

          return { content: [{ type: "text", text: formatDiagnostics(diagnostics) }] };
        }
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `LSP error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // ==================== ts_hover ====================
  pi.registerTool({
    name: "ts_hover",
    label: "TS Hover",
    description: "Get type information for a symbol at a specific position in a TypeScript file. Returns the type signature and documentation.",
    parameters: Type.Object({
      file: Type.String({ description: "File path" }),
      line: Type.Number({ description: "Line number (1-based)" }),
      character: Type.Number({ description: "Column number (1-based)" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { file, line, character } = params as { file: string; line: number; character: number };

      try {
        const absPath = resolve(ctx.cwd, file);
        await lsp.ensureRunning(absPath);
        await lsp.openFile(absPath);

        const result = await lsp.hover(absPath, line, character);

        if (!result) {
          return { content: [{ type: "text", text: `No type information at ${file}:${line}:${character}` }] };
        }

        let text = result.contents;
        if (result.range) {
          text = `${file}:${result.range.startLine}:${result.range.startChar}\n\n${text}`;
        }

        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `LSP error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // ==================== ts_definition ====================
  pi.registerTool({
    name: "ts_definition",
    label: "TS Go to Definition",
    description: "Find the definition of a symbol at a specific position. Returns the file and location where the symbol is defined.",
    parameters: Type.Object({
      file: Type.String({ description: "File path" }),
      line: Type.Number({ description: "Line number (1-based)" }),
      character: Type.Number({ description: "Column number (1-based)" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { file, line, character } = params as { file: string; line: number; character: number };

      try {
        const absPath = resolve(ctx.cwd, file);
        await lsp.ensureRunning(absPath);
        await lsp.openFile(absPath);

        const locations = await lsp.definition(absPath, line, character);

        if (locations.length === 0) {
          return { content: [{ type: "text", text: `No definition found at ${file}:${line}:${character}` }] };
        }

        const lines = locations.map((loc) => {
          // Try to read the line at the definition for a preview
          let preview = "";
          try {
            const content = readFileSync(loc.file, "utf-8");
            const fileLine = content.split("\n")[loc.line - 1];
            if (fileLine) preview = `  ${fileLine.trim()}`;
          } catch { /* ignore */ }
          return `${loc.file}:${loc.line}:${loc.character}${preview ? "\n" + preview : ""}`;
        });

        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `LSP error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // ==================== ts_references ====================
  pi.registerTool({
    name: "ts_references",
    label: "TS Find References",
    description: "Find all references to a symbol at a specific position. Returns every location where the symbol is used.",
    parameters: Type.Object({
      file: Type.String({ description: "File path" }),
      line: Type.Number({ description: "Line number (1-based)" }),
      character: Type.Number({ description: "Column number (1-based)" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { file, line, character } = params as { file: string; line: number; character: number };

      try {
        const absPath = resolve(ctx.cwd, file);
        await lsp.ensureRunning(absPath);
        await lsp.openFile(absPath);

        const locations = await lsp.references(absPath, line, character);

        if (locations.length === 0) {
          return { content: [{ type: "text", text: `No references found at ${file}:${line}:${character}` }] };
        }

        // Group by file
        const byFile = new Map<string, typeof locations>();
        for (const loc of locations) {
          const list = byFile.get(loc.file) ?? [];
          list.push(loc);
          byFile.set(loc.file, list);
        }

        const parts: string[] = [`${locations.length} reference${locations.length > 1 ? "s" : ""} found:\n`];

        for (const [refFile, locs] of byFile) {
          parts.push(`**${refFile}**`);
          for (const loc of locs) {
            let preview = "";
            try {
              const content = readFileSync(loc.file, "utf-8");
              const fileLine = content.split("\n")[loc.line - 1];
              if (fileLine) preview = ` — ${fileLine.trim()}`;
            } catch { /* ignore */ }
            parts.push(`  Line ${loc.line}:${loc.character}${preview}`);
          }
          parts.push("");
        }

        return { content: [{ type: "text", text: parts.join("\n") }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `LSP error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // ==================== ts_completions ====================
  pi.registerTool({
    name: "ts_completions",
    label: "TS Completions",
    description: "Get TypeScript completions at a specific position. Returns available methods, properties, and symbols with their types.",
    parameters: Type.Object({
      file: Type.String({ description: "File path" }),
      line: Type.Number({ description: "Line number (1-based)" }),
      character: Type.Number({ description: "Column number (1-based)" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { file, line, character } = params as { file: string; line: number; character: number };

      try {
        const absPath = resolve(ctx.cwd, file);
        await lsp.ensureRunning(absPath);
        await lsp.openFile(absPath);

        const items = await lsp.completions(absPath, line, character);

        if (items.length === 0) {
          return { content: [{ type: "text", text: `No completions at ${file}:${line}:${character}` }] };
        }

        const lines = items.map((item) => {
          let text = `${item.label} (${item.kind})`;
          if (item.detail) text += ` — ${item.detail}`;
          return text;
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `LSP error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });
```

**Step 2: Add the missing imports and helper at the top of index.ts**

Add `Type` import and the `formatDiagnostics` helper. The imports section at the top of index.ts should be:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  isEditToolResult,
  isWriteToolResult,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TypeScriptLspServer, type LspDiagnostic } from "./server.js";

const TS_EXTENSIONS = [".ts", ".tsx"];

function isTypeScriptFile(path: string): boolean {
  return TS_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function formatDiagnostics(diagnostics: LspDiagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const others = diagnostics.filter((d) => d.severity !== "error" && d.severity !== "warning");

  const counts: string[] = [];
  if (errors.length > 0) counts.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`);
  if (warnings.length > 0) counts.push(`${warnings.length} warning${warnings.length > 1 ? "s" : ""}`);
  if (others.length > 0) counts.push(`${others.length} info`);

  const header = `[TypeScript: ${counts.join(", ")}]`;
  const lines = diagnostics.map((d) => {
    const code = d.code ? ` TS${d.code}` : "";
    return `  ${d.file}:${d.line}:${d.character} - ${d.severity}${code}: ${d.message}`;
  });

  return header + "\n" + lines.join("\n");
}
```

**Step 3: Commit**

```bash
cd ~/.pi/agent
git add extensions/typescript-lsp/index.ts
git commit -m "feat: add on-demand TypeScript LSP tools

- ts_diagnostics: check errors/warnings for file or project
- ts_hover: get type info at position
- ts_definition: go to definition
- ts_references: find all references
- ts_completions: get completions at position"
```

---

### Task 5: Add promptGuidelines for TypeScript tools

**Files:**
- Modify: `~/.pi/agent/extensions/typescript-lsp/index.ts`

Add `promptGuidelines` to help the LLM know when and how to use the TypeScript tools effectively.

**Step 1: Add promptGuidelines to ts_diagnostics**

Find the `ts_diagnostics` tool registration and add after the `description` line:

```typescript
    promptGuidelines: [
      "After making multiple edits to TypeScript files, use ts_diagnostics to check the whole project compiles correctly.",
      "Use ts_hover to understand types before making changes to unfamiliar TypeScript code.",
      "Use ts_definition and ts_references to understand code structure and impact of changes.",
    ],
```

Only add to `ts_diagnostics` — it's the main entry point and these guidelines cover all the tools.

**Step 2: Commit**

```bash
cd ~/.pi/agent
git add extensions/typescript-lsp/index.ts
git commit -m "feat: add promptGuidelines for TypeScript LSP tools"
```

---

### Task 6: Smoke test

**Files:** None (testing only)

**Step 1: Test auto-diagnostics after edit**

Create a test TypeScript file with a type error, then edit it via pi:

```bash
mkdir -p /tmp/ts-lsp-test
cd /tmp/ts-lsp-test
echo '{ "compilerOptions": { "strict": true } }' > tsconfig.json
cat > test.ts << 'EOF'
const x: number = "hello";
const y: string = 42;
EOF
```

Start pi in that directory, ask it to read `test.ts` then edit it. After the edit, diagnostics should be appended to the result.

**Step 2: Test ts_diagnostics tool**

Ask: "Check test.ts for TypeScript errors"
Expected: Shows the type errors with file:line:col

**Step 3: Test ts_hover tool**

Ask: "What is the type of x at line 1, column 7 in test.ts?"
Expected: Shows `const x: number`

**Step 4: Test ts_definition tool**

Create a multi-file test:
```bash
cat > types.ts << 'EOF'
export interface User {
  name: string;
  age: number;
}
EOF
cat > main.ts << 'EOF'
import { User } from "./types";
const user: User = { name: "Alice", age: 30 };
EOF
```

Ask: "Go to definition of User at line 2, column 13 in main.ts"
Expected: Points to types.ts line 1

**Step 5: Test ts_references tool**

Ask: "Find all references to User in the project"
Expected: Shows both types.ts (definition) and main.ts (usage)

**Step 6: Commit any fixes**

```bash
cd ~/.pi/agent
git add -A extensions/typescript-lsp/
git commit -m "fix: address smoke test findings"
```

---

### Task 7: Cleanup and final commit

**Files:**
- Verify: `~/.pi/agent/extensions/typescript-lsp/index.ts`
- Verify: `~/.pi/agent/extensions/typescript-lsp/server.ts`
- Verify: `~/.pi/agent/extensions/typescript-lsp/package.json`

**Step 1: Verify extension directory structure**

Run: `find ~/.pi/agent/extensions/typescript-lsp -not -path "*/node_modules/*" | sort`
Expected:
```
extensions/typescript-lsp/
extensions/typescript-lsp/index.ts
extensions/typescript-lsp/package-lock.json
extensions/typescript-lsp/package.json
extensions/typescript-lsp/server.ts
```

**Step 2: Verify no stale code**

Run: `grep -r "TODO\|FIXME\|HACK" ~/.pi/agent/extensions/typescript-lsp/*.ts`
Expected: No matches

**Step 3: Final commit**

```bash
cd ~/.pi/agent
git add -A
git commit -m "feat: TypeScript LSP extension

- Auto-injects diagnostics after edit/write on .ts/.tsx files
- On-demand tools: ts_diagnostics, ts_hover, ts_definition, ts_references, ts_completions
- Lazy-starts typescript-language-server over stdio on first TS file interaction
- Shared server instance with session lifecycle management
- Crash recovery with automatic re-launch"
```

---

## Summary

| Task | What | Depends On |
|------|------|-----------|
| 1 | Scaffold extension directory + deps | — |
| 2 | LSP server manager (spawn, JSON-RPC, lifecycle) | 1 |
| 3 | Auto-inject diagnostics hook (tool_result) | 1, 2 |
| 4 | On-demand tools (5 tools) | 3 |
| 5 | promptGuidelines | 4 |
| 6 | Smoke test | 5 |
| 7 | Cleanup + final commit | 6 |

Tasks 2 is the heaviest (~10 min). Everything else chains sequentially.
