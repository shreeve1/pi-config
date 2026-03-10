---
name: pi-restart
description: Kill all running server instances for the current project and restart
---

# Restart Server

Kill all running instances of the project's server and start it fresh. Use this skill when the user asks to restart, reboot, or refresh the development server, or when the server appears stuck or needs a hard restart.

Do not use this skill for production deployments, systemd service management, or remote server operations — it is designed for local development servers only.

---

## Phase 1: Detect Server Type

Examine the current project to determine how the server is run. Use `Read` to check these in order:

1. Read `package.json` for `scripts.start`, `scripts.dev`, `scripts.serve` or similar server scripts
2. Read `Makefile` for `run`, `serve`, `start`, or `dev` targets
3. Read `docker-compose.yml` / `docker-compose.yaml` for service definitions
4. Read `Procfile` for web process definition
5. Check for `manage.py` (Django), `app.py`/`main.py` (Flask/FastAPI), `server.py`, or similar entry points
6. Check for `Cargo.toml` (Rust), `go.mod` (Go), `build.gradle` / `pom.xml` (Java)

If you cannot determine the server type, ask the user with `ask_user`: "How do you start your server?" with options based on common patterns found in the project.

---

## Phase 2: Kill Running Instances

Based on what you found, use `Bash` to kill processes. Use appropriate strategies:

- **Node.js**: `lsof -ti :<port> | xargs kill -9` and/or `pkill -f "node.*<script>"`
- **Python**: `pkill -f "python.*<entry>"` or `pkill -f "uvicorn|gunicorn|flask"`
- **Docker**: `docker compose down` or `docker-compose down`
- **Ruby/Rails**: `pkill -f "rails server|puma|unicorn"`
- **Go**: `pkill -f "<binary-name>"`
- **General**: If a port is known, use `lsof -ti :<port> | xargs kill -9`

Also check for and kill any background processes on common ports (3000, 3001, 4000, 5000, 5173, 8000, 8080, 8888) that match the project's server type.

Report what processes were found and killed. If none were running, note that.

---

## Phase 3: Restart the Server

Start the server using the detected command. Use `Bash` to run it:

- Prefer `dev` or `start` scripts over production commands
- Use the project's standard tooling (npm/yarn/pnpm, make, docker compose, etc.)
- Run with `&` suffix or use `nohup ... &` to background the process so it doesn't block

Wait a few seconds, then verify the server started successfully by checking with `Bash`:
- The process is running (`pgrep` or `ps aux | grep`)
- The port is listening (`lsof -i :<port>` or `curl -s localhost:<port>`)

---

## Report

After completing the restart, output:

```
Server Restart Complete

Project: <project directory name>
Server type: <detected type, e.g., "Next.js dev server">
Command: <the start command used>
Port: <port if known>

Killed: <number of processes killed, or "none running">
Status: <running | failed to start>
```

If the server failed to start, show the error output and suggest fixes.
