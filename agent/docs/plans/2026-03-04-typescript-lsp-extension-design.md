# TypeScript LSP Extension — Design

**Goal:** Give the LLM type-aware context when working with TypeScript files — auto-injected diagnostics after edits, plus on-demand tools for navigation and type inspection.

## Architecture

A pi extension (`typescript-lsp/`) that manages a `typescript-language-server` subprocess over stdio, communicating via LSP JSON-RPC.

**Components:**
- `server.ts` — LSP subprocess lifecycle (spawn, initialize, shutdown) + typed JSON-RPC client
- `index.ts` — Extension entry: registers tools + event hooks with pi
- `package.json` — Dependencies: `typescript`, `typescript-language-server`

**Data flow:**
```
LLM edits foo.ts
  → pi fires tool_result event
  → extension sends textDocument/didChange to LSP
  → extension requests textDocument/diagnostic
  → diagnostics appended to tool result

LLM calls ts_definition("foo.ts", line, character)
  → extension sends textDocument/definition to LSP
  → returns file + location
```

## Lifecycle

- **Lazy start** — LSP server not started until first `.ts`/`.tsx` file interaction (read/edit/write)
- **Session-scoped** — Runs for the duration of the session
- **Shutdown** — Clean shutdown on `session_shutdown` event
- **Crash recovery** — Detect subprocess exit, null out reference, re-launch lazily on next use

## Auto-Injected Diagnostics

Hooked into `tool_result` for `edit` and `write` tools on `.ts`/`.tsx` files.

After each edit/write:
1. Send `textDocument/didOpen` or `textDocument/didChange` to LSP
2. Request diagnostics (3s timeout — skip if slow, don't block LLM)
3. Append to tool result:

```
[TypeScript: 2 errors, 1 warning]
  src/foo.ts:15:3 - error TS2322: Type 'string' is not assignable to type 'number'.
  src/foo.ts:22:10 - error TS2304: Cannot find name 'bar'.
  src/foo.ts:8:1 - warning TS6133: 'unused' is declared but its value is never read.
```

## On-Demand Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `ts_diagnostics` | `file?` (optional, whole project if omitted) | Error/warning list with file:line:col |
| `ts_hover` | `file`, `line`, `character` | Type information at position |
| `ts_definition` | `file`, `line`, `character` | Definition location(s) — file + line + preview |
| `ts_references` | `file`, `line`, `character` | All reference locations — file + line + preview |
| `ts_completions` | `file`, `line`, `character` | Completion items with types |

All on-demand tools have a 10s timeout.

## File Tracking

The extension tracks which files have been opened with the LSP via `didOpen`:
- First interaction with a file → `didOpen` with current content
- Subsequent edits → `didChange` with updated content
- Reads on unopened files → `didOpen` (so LSP knows about the file for cross-references)

## Tsconfig Resolution

For v1: find the nearest `tsconfig.json` walking up from the file being opened. Initialize the language server with the workspace root set to that tsconfig's directory.

Multi-project / monorepo support deferred to future enhancement.

## Error Handling

- **No tsconfig found:** Language server uses default compiler options
- **Slow diagnostics after edit:** 3s timeout, skip if exceeded
- **LSP crash:** Detect exit, reset state, re-launch on next use
- **File outside project:** LSP handles gracefully with reduced accuracy

## Dependencies

```json
{
  "typescript": "^5.x",
  "typescript-language-server": "^4.x"
}
```
