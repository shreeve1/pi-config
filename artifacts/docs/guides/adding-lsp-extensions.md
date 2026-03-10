# Adding LSP Extensions to Pi

How to build pi extensions that integrate Language Server Protocol (LSP) servers, giving the LLM type-aware context, diagnostics, and code navigation.

This guide uses the TypeScript LSP extension as a reference implementation. The same pattern works for any language with an LSP server.

## Architecture

An LSP extension has three parts:

1. **Server manager** (`server.ts`) — Spawns the language server subprocess over stdio, communicates via JSON-RPC, exposes a clean API
2. **Extension entry** (`index.ts`) — Registers tools and event hooks with pi
3. **Dependencies** (`package.json`) — The language server binary and JSON-RPC libraries

```
~/.pi/agent/extensions/<language>-lsp/
├── package.json      # Language server + vscode-jsonrpc
├── index.ts          # Pi extension: tools + hooks
└── server.ts         # LSP subprocess manager
```

## Step 1: Scaffold the Extension

Create a directory-based extension with a `package.json`:

```bash
mkdir -p ~/.pi/agent/extensions/<language>-lsp
cd ~/.pi/agent/extensions/<language>-lsp
```

```json
{
  "name": "pi-<language>-lsp",
  "private": true,
  "type": "module",
  "dependencies": {
    "vscode-jsonrpc": "^8.2.1",
    "vscode-languageserver-protocol": "^3.17.5",
    "<language-server-package>": "^x.y.z"
  }
}
```

Then install:

```bash
npm install
```

### Common Language Servers

| Language | npm Package | Binary |
|----------|------------|--------|
| TypeScript | `typescript-language-server` + `typescript` | `typescript-language-server --stdio` |
| Python | `pyright` | `pyright-langserver --stdio` |
| Rust | — (install `rust-analyzer` via rustup) | `rust-analyzer` |
| Go | — (install `gopls` via `go install`) | `gopls serve` |
| CSS/HTML | `vscode-langservers-extracted` | `vscode-css-language-server --stdio` |
| JSON | `vscode-langservers-extracted` | `vscode-json-language-server --stdio` |
| YAML | `yaml-language-server` | `yaml-language-server --stdio` |
| Bash | `bash-language-server` | `bash-language-server start` |
| Markdown | `marksman` (binary) | `marksman server` |

For servers not available via npm, install them globally and reference the binary path directly.

## Step 2: Build the Server Manager

The server manager handles:
- Spawning the language server process over stdio
- The LSP initialize/initialized handshake
- Sending notifications (`didOpen`, `didChange`)
- Making requests (`hover`, `definition`, `references`, `diagnostics`)
- Shutdown and crash recovery

### JSON-RPC Transport

Use `vscode-jsonrpc` to handle the LSP wire protocol:

```typescript
import { spawn } from "node:child_process";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";

const proc = spawn("<language-server-binary>", ["--stdio"], {
  cwd: projectRoot,
  stdio: ["pipe", "pipe", "pipe"],
});

const connection = createMessageConnection(
  new StreamMessageReader(proc.stdout!),
  new StreamMessageWriter(proc.stdin!),
);

connection.listen();
```

### Initialize Handshake

Every LSP server requires an initialize → initialized handshake before it accepts any other requests:

```typescript
const result = await connection.sendRequest("initialize", {
  processId: process.pid,
  rootUri: `file://${projectRoot}`,
  capabilities: {
    textDocument: {
      synchronization: { didSave: true },
      hover: { contentFormat: ["plaintext", "markdown"] },
      definition: {},
      references: {},
      completion: { completionItem: { snippetSupport: false } },
      publishDiagnostics: { relatedInformation: true },
    },
    workspace: { workspaceFolders: true },
  },
  workspaceFolders: [
    { uri: `file://${projectRoot}`, name: "workspace" },
  ],
});

connection.sendNotification("initialized", {});
```

> **Important:** Use string method names (`"initialize"`, `"textDocument/hover"`, etc.) instead of typed constants from `vscode-languageserver-protocol`. The typed `ProtocolRequestType` objects conflict with `vscode-jsonrpc` v8's `ParameterStructures.byName` check.

### Opening and Updating Files

The LSP server needs to know about files before it can analyze them:

```typescript
// Open a file (first time)
connection.sendNotification("textDocument/didOpen", {
  textDocument: {
    uri: `file://${absolutePath}`,
    languageId: "<language>",  // "typescript", "python", "rust", etc.
    version: 1,
    text: fileContent,
  },
});

// Update after edit (full content sync)
connection.sendNotification("textDocument/didChange", {
  textDocument: { uri: `file://${absolutePath}`, version: 2 },
  contentChanges: [{ text: newContent }],
});
```

### Making Requests

All LSP requests follow the same pattern — method name + params:

```typescript
// Hover (type info)
const hover = await connection.sendRequest("textDocument/hover", {
  textDocument: { uri: fileUri },
  position: { line: 0, character: 5 },  // 0-based
});

// Go to definition
const def = await connection.sendRequest("textDocument/definition", {
  textDocument: { uri: fileUri },
  position: { line: 0, character: 5 },
});

// Find references
const refs = await connection.sendRequest("textDocument/references", {
  textDocument: { uri: fileUri },
  position: { line: 0, character: 5 },
  context: { includeDeclaration: true },
});

// Completions
const completions = await connection.sendRequest("textDocument/completion", {
  textDocument: { uri: fileUri },
  position: { line: 0, character: 10 },
});
```

### Receiving Diagnostics

Most LSP servers push diagnostics via notifications rather than pull:

```typescript
connection.onNotification("textDocument/publishDiagnostics", (params) => {
  // params.uri — the file
  // params.diagnostics — array of { range, severity, code, message }
  cache.set(params.uri, params.diagnostics);
});
```

Some servers also support pull diagnostics via `textDocument/diagnostic`, but push is more universal.

### Crash Recovery

Handle the subprocess exiting unexpectedly:

```typescript
proc.on("exit", () => {
  connection = null;
  process = null;
  initialized = false;
  openFiles.clear();
});
```

On next use, `ensureRunning()` detects the server is down and relaunches it.

### Shutdown

Clean shutdown on session end:

```typescript
await connection.sendRequest("shutdown");
connection.sendNotification("exit");
proc.kill();
```

## Step 3: Register Tools and Hooks

### Auto-Inject Diagnostics

Hook into `tool_result` to append diagnostics after edits:

```typescript
import {
  isEditToolResult,
  isWriteToolResult,
} from "@mariozechner/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  let filePath: string | undefined;

  if (isEditToolResult(event)) {
    filePath = (event.input as { path?: string }).path;
  } else if (isWriteToolResult(event)) {
    filePath = (event.input as { path?: string }).path;
  }

  if (!filePath || !isTargetLanguageFile(filePath)) return;
  if (event.isError) return;

  // Update LSP and get diagnostics
  const absPath = resolve(ctx.cwd, filePath);
  await lsp.ensureRunning(absPath);
  const content = readFileSync(absPath, "utf-8");
  await lsp.updateFile(absPath, content);
  const diagnostics = await lsp.getDiagnostics(absPath, 3000);

  if (diagnostics.length === 0) return;

  // Append to tool result
  const existingText = event.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  return {
    content: [{ type: "text", text: existingText + "\n\n" + formatDiagnostics(diagnostics) }],
  };
});
```

### On-Demand Tools

Register tools the LLM can call explicitly:

```typescript
import { Type } from "@sinclair/typebox";

pi.registerTool({
  name: "<lang>_diagnostics",
  label: "<Lang> Diagnostics",
  description: "Get <language> diagnostics for a file",
  parameters: Type.Object({
    file: Type.Optional(Type.String({ description: "File path" })),
  }),
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    // ... call lsp.getDiagnostics() and format result
  },
});
```

Typical tool set for any language:
- `<lang>_diagnostics` — errors and warnings
- `<lang>_hover` — type info at position
- `<lang>_definition` — go to definition
- `<lang>_references` — find all references
- `<lang>_completions` — available symbols at position

### Lifecycle Management

```typescript
pi.on("session_shutdown", async () => {
  await lsp.shutdown();
});
```

## Step 4: promptGuidelines

Add guidelines to the primary tool so the LLM knows when to use the LSP tools:

```typescript
pi.registerTool({
  name: "<lang>_diagnostics",
  // ...
  promptGuidelines: [
    "After making multiple edits to <language> files, use <lang>_diagnostics to check for errors.",
    "Use <lang>_hover to understand types before modifying unfamiliar code.",
    "Use <lang>_definition and <lang>_references to understand code structure.",
  ],
});
```

## Key Design Decisions

### Lazy Start
Don't spawn the language server until the LLM actually touches a file of that language. Zero overhead when not needed.

### Timeouts
- **Auto-inject diagnostics:** 3s timeout — don't block the LLM if the server is slow
- **On-demand tools:** 10s timeout — user explicitly asked, so wait longer

### Full Content Sync
Use `TextDocumentSyncKind.Full` (send entire file on change) rather than incremental. Simpler, and we always have the full content after an edit.

### Project Detection
Walk up from the file to find the project config (`tsconfig.json`, `pyproject.toml`, `Cargo.toml`, etc.). Initialize the server against that root.

## Reference: TypeScript LSP Extension

The working TypeScript implementation lives at:

```
~/.pi/agent/extensions/typescript-lsp/
├── package.json      # typescript, typescript-language-server, vscode-jsonrpc, vscode-languageserver-protocol
├── server.ts         # TypeScriptLspServer class — full LSP lifecycle
└── index.ts          # Auto-diagnostics hook + 5 on-demand tools
```

Use this as a template. To add a new language, copy the structure and swap:
1. The language server binary in `package.json`
2. The `languageId` in `didOpen` notifications
3. The file extension detection (`.ts`/`.tsx` → `.py`, `.rs`, etc.)
4. The project config detection (`tsconfig.json` → `pyproject.toml`, `Cargo.toml`, etc.)
5. Tool names and descriptions
