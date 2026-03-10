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

      // Format and append diagnostics to tool result
      const diagnosticText = "\n\n" + formatDiagnostics(diagnostics);

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

  // ==================== ts_diagnostics ====================
  pi.registerTool({
    name: "ts_diagnostics",
    label: "TS Diagnostics",
    description: "Get TypeScript diagnostics (errors, warnings) for a file or the whole project. Useful to check if code compiles correctly.",
    promptGuidelines: [
      "After making multiple edits to TypeScript files, use ts_diagnostics to check the whole project compiles correctly.",
      "Use ts_hover to understand types before making changes to unfamiliar TypeScript code.",
      "Use ts_definition and ts_references to understand code structure and impact of changes.",
    ],
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
}
