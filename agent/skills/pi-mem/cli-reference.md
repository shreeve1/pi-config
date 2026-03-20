# Pi Mem CLI Reference

Complete reference for `pi-mem-cli.py` commands, arguments, and outputs.

CLI path (default):

```bash
python3 ~/.pi/agent/scripts/pi-mem-cli.py <command> [options]
```

All commands write JSON to stdout with a top-level `status` field (`"ok"` or `"error"`).

---

## Global Options

There are no global flags; every option is per-command.

All commands follow this pattern:

```bash
python3 ~/.pi/agent/scripts/pi-mem-cli.py <command> [options]
```

On success:

```json
{
  "status": "ok",
  // command-specific fields
}
```

On error:

```json
{
  "status": "error",
  "error": "error_code",
  "message": "Human-readable message"
}
```

---

## init

Initialize database for a scope (project or global). Safe to run multiple times.

```bash
python3 pi-mem-cli.py init --scope project --project-path "/path/to/project"
python3 pi-mem-cli.py init --scope global
```

**Arguments:**

| Flag            | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `--scope`       | Yes      | `project` or `global`                        |
| `--project-path` | If scope=project | Absolute or cwd-relative project root |

**Output (success):**

```json
{
  "status": "ok",
  "scope": "project",
  "database_path": "/Users/you/.pi/data/memory/projects/<hash>-<name>/memory.db"
}
```

---

## migrate

Run database migrations for the given scope. Idempotent.

```bash
python3 pi-mem-cli.py migrate --scope project --project-path "/path/to/project"
python3 pi-mem-cli.py migrate --scope global
```

**Arguments:**

| Flag            | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `--scope`       | Yes      | `project` or `global`                        |
| `--project-path` | If scope=project | Project root                         |

**Output (success):**

```json
{
  "status": "ok",
  "migrations_applied": [1]
}
```

If the DB is already at latest version, the array may be empty.

---

## save-project

Save a project session with optional transcript/summary text from stdin.

```bash
cat transcript_or_summary.txt | python3 pi-mem-cli.py save-project \
  --project-path "/path/to/project" \
  --description "Implemented feature X"
```

**Arguments:**

| Flag            | Required | Description                          |
|----------------|----------|--------------------------------------|
| `--project-path` | Yes    | Project root                         |
| `--description`  | Yes    | Session description (short text)     |
| stdin           | No       | Session transcript or summary text   |

**Output (success):**

```json
{
  "status": "ok",
  "session_id": "uuid-string",
  "description": "Implemented feature X",
  "files_tracked": 0,
  "chunks_stored": 1,
  "git_branch": null,
  "git_commit": null
}
```

---

## save-checkpoint

Save a checkpoint session with structured resume context and optional plan link.

```bash
cat resume_context.txt | python3 pi-mem-cli.py save-checkpoint \
  --project-path "/path/to/project" \
  --description "Halfway through refactor" \
  --task-dir "project-name" \
  --resume-context "Goal: ...\nDone: ..." \
  --plan-path "artifacts/plans/refactor.md"
```

**Arguments:**

| Flag              | Required | Description                                  |
|------------------|----------|----------------------------------------------|
| `--project-path` | Yes      | Project root                                 |
| `--description`  | Yes      | Short description (prefix `[CHECKPOINT]` added automatically) |
| `--task-dir`     | No       | Logical task directory name                  |
| `--resume-context` | No     | Structured resume context text               |
| `--plan-path`    | No       | Relative path to linked plan file            |
| stdin            | No       | Optional transcript/summary content          |

**Output (success):**

```json
{
  "status": "ok",
  "session_id": "uuid-string",
  "description": "[CHECKPOINT] Halfway through refactor",
  "files_tracked": 0,
  "chunks_stored": 1,
  "tasks_snapshot": 0,
  "active_task_ids": [],
  "has_resume_context": true,
  "plan_path": "artifacts/plans/refactor.md"
}
```

---

## save-global

Save a global learning (cross-project memory) with optional tags and category.

```bash
echo "Detailed learning content" | python3 pi-mem-cli.py save-global \
  --description "Always use connection pooling" \
  --category "pattern" \
  --tags "database,performance" \
  --source-project "/path/to/project"
```

**Arguments:**

| Flag             | Required | Description                                      |
|-----------------|----------|--------------------------------------------------|
| `--description`  | Yes      | Short learning description                       |
| `--category`     | No       | `pattern`, `preference`, `lesson`, `technique`, `general` (default `general`) |
| `--tags`         | No       | Comma-separated tag list                         |
| `--source-project` | No     | Project where learning originated                |
| stdin            | No       | Detailed content text                            |

**Output (success):**

```json
{
  "status": "ok",
  "id": 42,
  "description": "Always use connection pooling",
  "category": "pattern",
  "tags": ["database", "performance"]
}
```

---

## list

List recent records for a scope.

```bash
python3 pi-mem-cli.py list --scope project --project-path "/path/to/project" --limit 5
python3 pi-mem-cli.py list --scope global --limit 10
```

**Arguments:**

| Flag            | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `--scope`       | Yes      | `project` or `global`                        |
| `--project-path` | If project | Project root                             |
| `--limit`       | No       | Max records (default 10)                    |

**Output (project):**

```json
{
  "status": "ok",
  "scope": "project",
  "records": [
    {
      "id": "uuid",
      "description": "Implemented feature X",
      "created_at": "2026-03-07T12:00:00Z",
      "type": "session"
    }
  ]
}
```

**Output (global):**

```json
{
  "status": "ok",
  "scope": "global",
  "records": [
    {
      "id": 42,
      "description": "Always use connection pooling",
      "category": "pattern",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

---

## list-old

List records older than a given number of days.

```bash
python3 pi-mem-cli.py list-old --scope project --project-path "/path/to/project" --older-than-days 30
python3 pi-mem-cli.py list-old --scope global --older-than-days 7
```

**Arguments:**

| Flag               | Required | Description                                  |
|-------------------|----------|----------------------------------------------|
| `--scope`          | Yes      | `project` or `global`                        |
| `--project-path`   | If project | Project root                               |
| `--older-than-days` | Yes     | Minimum age in days                         |

**Output (project example):**

```json
{
  "status": "ok",
  "scope": "project",
  "records": [
    {
      "id": "uuid",
      "description": "Old session",
      "created_at": "2026-02-01T10:00:00Z",
      "type": "checkpoint",
      "age_days": 35
    }
  ]
}
```

---

## search

Full-text search across records.

```bash
python3 pi-mem-cli.py search --scope project --project-path "/path/to/project" --query "auth" --limit 5
python3 pi-mem-cli.py search --scope global --query "database patterns" --limit 5

# Filter project checkpoints by plan path
python3 pi-mem-cli.py search --scope project --project-path "/path/to/project" \
  --query "checkpoint" --plan-path "artifacts/plans/auth-refactor.md" --limit 5
```

**Arguments:**

| Flag            | Required | Description                                      |
|----------------|----------|--------------------------------------------------|
| `--scope`       | Yes      | `project` or `global`                            |
| `--project-path` | If project | Project root                                   |
| `--query`       | Yes      | Search terms (FTS5 syntax)                      |
| `--limit`       | No       | Max results (default 10)                        |
| `--plan-path`   | No       | Filter project records by `metadata.plan_path`  |

**Output (project):**

```json
{
  "status": "ok",
  "scope": "project",
  "query": "auth",
  "records": [
    {
      "id": "uuid",
      "description": "Implemented auth",
      "created_at": "2026-03-07T12:00:00Z",
      "type": "session",
      "snippet": "...JWT authentication..."
    }
  ]
}
```

**Output (global):**

```json
{
  "status": "ok",
  "scope": "global",
  "query": "database patterns",
  "records": [
    {
      "id": 42,
      "description": "Always use connection pooling",
      "category": "pattern",
      "created_at": "2026-03-01T10:00:00Z",
      "snippet": "...connection pooling for DB performance..."
    }
  ]
}
```

---

## show

Get full details of a record.

```bash
python3 pi-mem-cli.py show --scope project --project-path "/path/to/project" --id "uuid"
python3 pi-mem-cli.py show --scope global --id 42
```

**Arguments:**

| Flag            | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `--scope`       | Yes      | `project` or `global`                        |
| `--project-path` | If project | Project root                           |
| `--id`          | Yes      | Record ID (string UUID or integer)          |

**Project session/checkpoint output:**

```json
{
  "status": "ok",
  "id": "uuid",
  "description": "[CHECKPOINT] Halfway through refactor",
  "created_at": "2026-03-07T12:00:00Z",
  "git_branch": "feature/refactor",
  "git_commit": "abc123",
  "files": ["src/file1.py"],
  "content": "Full transcript or summary...",
  "metadata": {
    "type": "checkpoint",
    "resume_context": "Goal: ...\nDone: ...",
    "plan_path": "artifacts/plans/refactor.md",
    "task_dir": "project-name",
    "task_snapshot": null
  }
}
```

**Global learning output:**

```json
{
  "status": "ok",
  "id": 42,
  "description": "Always use connection pooling",
  "category": "pattern",
  "tags": ["database", "performance"],
  "source_project": "/path/to/project",
  "created_at": "2026-03-01T10:00:00Z",
  "content": "Detailed learning..."
}
```

---

## delete

Delete a record.

```bash
python3 pi-mem-cli.py delete --scope project --project-path "/path/to/project" --id "uuid"
python3 pi-mem-cli.py delete --scope global --id 42
```

**Arguments:**

| Flag            | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `--scope`       | Yes      | `project` or `global`                        |
| `--project-path` | If project | Project root                           |
| `--id`          | Yes      | Record ID to delete (UUID or integer)       |

**Output (success):**

```json
{
  "status": "ok",
  "deleted_id": "uuid or int"
}
```

If the record does not exist, you get an error:

```json
{
  "status": "error",
  "error": "record_not_found",
  "message": "Record not found: <id>"
}
```

---

## Database Locations and Schema (Summary)

- Project DBs: `~/.pi/data/memory/projects/{hash16}-{basename}/memory.db`
- Global DB: `~/.pi/data/memory/global/memory.db`

Project DB core tables:

- `project_records`:
  - `id` (TEXT, primary key)
  - `description`, `created_at`, `git_branch`, `git_commit`, `files_json`, `content`, `type`, `metadata_json`
- `project_records_fts` (FTS5):
  - `record_id`, `description`, `content`, `metadata`

Global DB core tables:

- `global_learnings`:
  - `id` (INTEGER primary key), `description`, `category`, `tags_json`, `source_project`, `created_at`, `content`
- `global_learnings_fts` (FTS5):
  - `learning_id`, `description`, `content`, `tags`, `category`

Both DBs also have a `schema_version` table for migrations.
