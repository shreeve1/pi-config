# Background Tasks Extension

Run long-running commands (dev servers, log watchers, tests) in the background while continuing your conversation.

## Features

- **Tabbed widget interface** - Switch between multiple background tasks
- **Rolling buffer** - Keeps last 200 lines of output (configurable)
- **Full output preservation** - All output saved to temp files
- **Pause/Resume** - Control running tasks with SIGSTOP/SIGCONT
- **Auto-detection** - Prompts to run long commands in background
- **Output filtering** - Exclude patterns and highlight ERROR/WARN/INFO keywords
- **Status indicators** - Visual status (running/paused/stopped/error) with new output alerts

## Tools

### `background_task`

Start, stop, pause, resume, or restart background tasks.

**Start a task:**
```json
{
  "action": "start",
  "id": "dev-server",
  "label": "Dev Server",
  "command": "npm run dev",
  "filters": {
    "exclude": ["^debug:", "GET /health"],
    "highlight": true
  },
  "bufferSize": 200
}
```

**Stop a task:**
```json
{
  "action": "stop",
  "id": "dev-server"
}
```

**Pause a task:**
```json
{
  "action": "pause",
  "id": "dev-server"
}
```

**Resume a task:**
```json
{
  "action": "resume",
  "id": "dev-server"
}
```

**Restart a task:**
```json
{
  "action": "restart",
  "id": "dev-server"
}
```

### `list_background_tasks`

List all running background tasks with their status.

### `background_task_output`

Retrieve output from a background task.

```json
{
  "id": "dev-server",
  "full": false,
  "offset": 0
}
```

- `full`: Read from temp file (true) or buffer (false, default)
- `offset`: Line number to start from (for paging full output)

## Commands

- `/bg-list` - List all background tasks
- `/bg-stop <task-id>` - Stop a background task by ID

## Auto-Detection

When the LLM suggests commands matching these patterns, you'll be prompted to run them in background:

- `npm run dev|start|watch`
- `yarn dev|start|watch`
- `pnpm dev|start|watch`
- `npm run build -- --watch`
- `tail -f`
- `watch`
- Commands containing "serve" or "server"

## Widget Interface

The widget appears below the editor and shows:

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
... (195 more lines, 10min old)

Controls: [1-9] Switch | [S]top | [P]ause | [R]esume | [V]iew full | Esc
```

**Status indicators:**
- `●` Running
- `●+` Running with new output
- `⏸` Paused
- `✓` Stopped (exit code 0)
- `✗` Error (non-zero exit code)

**Controls:**
- `1-9` - Switch to tab N
- `Ctrl+B` - Focus background tasks widget (registered shortcut)

## Output Handling

**Rolling Buffer:**
- Default: 200 lines per task
- Old lines are dropped when buffer is full
- Configure with `bufferSize` parameter

**Full Output:**
- All output saved to `/tmp/pi-bg-task-{id}-{timestamp}.log`
- Files cleaned up on session shutdown or when task stops
- Use `background_task_output` with `full: true` to read

**Filtering:**
```json
{
  "filters": {
    "exclude": ["^debug:", "GET /health", "ping"],
    "highlight": true
  }
}
```

- `exclude`: Array of regex patterns to suppress matching lines
- `highlight`: Auto-color lines containing ERROR/WARN/INFO keywords

## Lifecycle

- **Session start** - Widget initialized, task list cleared
- **Session shutdown** - All tasks terminated, temp files cleaned up
- **Tasks** - Do NOT persist across sessions

## Examples

### Start a dev server
```
Run "npm run dev" in background so I can continue working.
```

### Watch logs with filtering
```
Start a background task watching logs. Exclude health check endpoints and highlight errors.
```

### Multiple tasks
```
Start three background tasks:
1. dev-server: "npm run dev"
2. tests: "npm run test -- --watch"
3. logs: "tail -f logs/*.log"
```

### Check task status
```
List all running background tasks and their status.
```

### Get full output
```
Retrieve the full output from the dev-server task from the log file.
```
