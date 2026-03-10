# Background Tasks Extension

Run long-running commands (dev servers, log watchers, test suites) in a persistent widget while continuing your pi conversation. Tasks don't block the agent—you can interact with pi while background processes run.

**Designed for:** Pi extension developers, users who run long-lived development processes

---

## Overview

The background tasks extension solves the problem where commands like `npm run dev`, `tail -f logs`, or `npm test -- --watch` block the conversation, making you wait for them to complete before continuing work.

With this extension:
- Long-running commands execute in background processes
- Output streams in real-time to a tabbed widget below the editor
- You can pause, resume, stop, or restart tasks at any time
- Auto-detection prompts you to background likely long-running commands

---

## Features

### Tabbed Widget Interface

A persistent widget appears below your editor showing all background tasks:

```
Background Tasks
──────────────────────────────────────────────────────────
● 1:●  dev-server   2:●+ tests   3:⏸  logs
──────────────────────────────────────────────────────────
dev-server (PID 12345)
Running • paused • stopped • error

[stop] [pause] [resume] [restart] [view-full-output]
──────────────────────────────────────────────────────────
10:23:45 Server listening on http://localhost:3000
10:23:46 GET /api/users 200 12ms
10:23:47 POST /api/login 200 45ms   ← highlighted ERROR
```

**Status indicators:**
- `●` Running
- `●+` Running with new output since last viewed
- `⏸` Paused
- `✓` Stopped (exit code 0)
- `✗` Error (non-zero exit code)

### Rolling Buffer + Full Output

- **Rolling buffer:** Shows last 200 lines (configurable) in the widget
- **Full output:** All output saved to `/tmp/pi-bg-task-{id}-{timestamp}.log`
- **Temp files:** Automatically cleaned up when tasks stop or pi exits

### Task Controls

Full lifecycle management for background processes:

| Action | Tool | Command | Effect |
|---------|-------|----------|---------|
| Start | `background_task` with `action: "start"` | Spawn new background process |
| Stop | `background_task` with `action: "stop"` | Terminate with SIGTERM |
| Pause | `background_task` with `action: "pause"` | Send SIGSTOP (freeze) |
| Resume | `background_task` with `action: "resume"` | Send SIGCONT (unfreeze) |
| Restart | `background_task` with `action: "restart"` | Stop and respawn task |
| List | `list_background_tasks` | Query all tasks |
| Output | `background_task_output` | Retrieve buffer or full log file |

Quick commands:
- `/bg-list` - List all background tasks
- `/bg-stop <id>` - Stop a task by ID

### Auto-Detection

When the LLM suggests commands matching these patterns, you'll be prompted to run them in background:

- `npm run dev|start|watch`
- `yarn dev|start|watch`
- `pnpm dev|start|watch`
- `npm run build -- --watch`
- `tail -f`
- Commands containing `watch`, `serve`, or `server`

Example prompt:
```
Long-running command detected

"npm run dev" looks like it will run for a while. Run in background?

• Yes (recommended) - Runs in widget, you can continue
• No - Run normally (blocks conversation)
```

### Output Filtering

Reduce noise and highlight important messages:

```json
{
  "filters": {
    "exclude": ["^debug:", "GET /health", "ping"],
    "highlight": true
  }
}
```

- `exclude`: Array of regex patterns—matching lines are hidden from buffer
- `highlight`: Auto-color lines containing ERROR, WARN, INFO, FATAL, FAIL

---

## Installation

Place `background-tasks.ts` in any auto-discovered location:

| Location | Scope |
|----------|-------|
| `~/.pi/agent/extensions/background-tasks.ts` | Global (all projects) |
| `.pi/extensions/background-tasks.ts` | Project-local |
| `.pi/extensions/background-tasks/` | Project-local (directory with index.ts) |

The extension auto-loads when pi starts. No installation commands needed.

---

## Usage Examples

### Start a Development Server

```
Start "npm run dev" in background so I can continue working.
```

The LLM calls:
```json
{
  "action": "start",
  "id": "dev-server",
  "label": "Dev Server",
  "command": "npm run dev"
}
```

### Watch Logs with Filtering

```
Watch the application logs in background. Exclude health check endpoints and highlight errors.
```

The LLM calls:
```json
{
  "action": "start",
  "id": "app-logs",
  "label": "App Logs",
  "command": "tail -f logs/*.log",
  "filters": {
    "exclude": ["GET /health"],
    "highlight": true
  }
}
```

### Multiple Concurrent Tasks

```
Start three background tasks: dev server, test watcher, and log viewer.
```

The LLM creates three tasks:
```json
[
  {
    "action": "start",
    "id": "dev",
    "label": "Dev Server",
    "command": "npm run dev"
  },
  {
    "action": "start",
    "id": "tests",
    "label": "Tests",
    "command": "npm run test -- --watch"
  },
  {
    "action": "start",
    "id": "logs",
    "label": "Logs",
    "command": "tail -f logs/*.log"
  }
]
```

### Pause and Resume

```
Pause the tests task, then resume it when I'm ready.
```

### Query Status

```
List all my running background tasks and their status.
```

The `list_background_tasks` tool returns:
```json
{
  "tasks": [
    {
      "id": "dev-server",
      "label": "Dev Server",
      "command": "npm run dev",
      "status": "running",
      "pid": 12345,
      "bufferLineCount": 150,
      "bufferSize": 200
    }
  ]
}
```

### Retrieve Full Output

```
Get the full output from the dev-server task, not just the buffer.
```

The LLM calls:
```json
{
  "id": "dev-server",
  "full": true
}
```

---

## Tool Reference

### background_task

Main control tool for background task lifecycle.

**Parameters:**
- `action` (required): `"start" | "stop" | "pause" | "resume" | "restart"`
- `id` (required for all actions except start): Unique task identifier
- `label` (required for start): Display name
- `command` (required for start): Command to execute
- `cwd` (optional): Working directory (defaults to project dir)
- `filters` (optional): `{ exclude: string[], highlight: boolean }`
- `bufferSize` (optional): Number of lines in buffer (default: 200)

**Returns:**
```json
{
  "content": [{ "type": "text", "text": "Started background task: Dev Server (PID 12345)" }],
  "details": { "id": "dev-server", "pid": 12345, "status": "running" }
}
```

### list_background_tasks

Query all running background tasks.

**Parameters:** None

**Returns:**
```json
{
  "content": [{ "type": "text", "text": "● Dev Server (dev-server)..." }],
  "details": { "tasks": [...] }
}
```

### background_task_output

Retrieve output from a specific task.

**Parameters:**
- `id` (required): Task identifier
- `full` (optional, default: false): Read from log file instead of buffer
- `offset` (optional): Line number to start from (for paging)

**Returns:**
```json
{
  "content": [{ "type": "text", "text": "..." }],
  "details": { "id": "dev-server", "bufferLineCount": 150, "outputFile": "/tmp/..." }
}
```

---

## Architecture

### Task State

Each background task tracks:

```typescript
interface BackgroundTask {
  id: string;                    // Unique identifier
  label: string;                 // Display name
  command: string;                // Command string
  cwd: string;                   // Working directory
  status: "running" | "paused" | "stopped" | "error";
  pid?: number;                   // Process ID
  process?: ChildProcess;         // Node.js process handle
  createdAt: number;             // Timestamp
  exitCode?: number;             // Exit status (when stopped)
  outputFile: string;             // Temp file path
  filters?: {                    // Output filtering
    exclude: string[];
    highlight: boolean;
  };
  bufferSize: number;             // Buffer capacity
  buffer: string[];              // Rolling buffer
  hasNewOutput: boolean;          // Unviewed output flag
}
```

### Widget Rendering

The `BackgroundWidget` class extends pi's TUI component system:
- Renders a `Container` with tabs and active task output
- Updates via `ctx.ui.setWidget()` with callback pattern
- Supports dynamic content (scrolling, status changes)

### Process Management

Tasks spawn with `spawn("sh", ["-c", command])`:
- Detached: `false` (pi monitors lifecycle)
- Stdio: `["ignore", "pipe", "pipe"]` (stdout/stderr captured)
- Signals: `SIGTERM` (stop), `SIGSTOP` (pause), `SIGCONT` (resume)

### Lifecycle Events

| Event | Handler | Purpose |
|--------|----------|---------|
| `session_start` | Initialize widget, clear task map | Setup |
| `tool_call` | Auto-detect long commands | User convenience |
| `session_shutdown` | Kill all tasks, clean temp files | Cleanup |

---

## Limitations

- **No persistence across sessions** - Tasks die when pi exits (by design)
- **Linux/macOS signals only** - SIGSTOP/SIGCONT work on Unix-like systems
- **Buffer limit** - Only last N lines visible in widget (full output in files)
- **Single pi instance** - Tasks are local to current pi session, not shared

---

## See Also

- [Extensions Guide](reference/extensions-guide.md) — General extension architecture
- [Auto-Delegate Extension](reference/auto-delegate-extension.md) — Intent-based routing to subagents
- [Skills](reference/skills.md) — Alternative to tools for on-demand capabilities
