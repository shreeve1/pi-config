---
name: pi-mem
description: Use when you need to browse, search, save, checkpoint, clean up, or resume long-lived project/global memory across pi sessions using /mem-style commands.
---

# Pi Memory Skill (`pi-mem`)

Use this skill to manage long-lived memory for pi sessions: project sessions, checkpoints, and global learnings.  
Use it whenever the user invokes `/mem` commands or explicitly asks to save, search, clean up, or resume across-session memory.

Do **not** use this skill for short-lived context that only matters in the current conversation, or for general domain knowledge that belongs in `save_to_memory` / `search_knowledge` (client/project KB).

All storage is handled by the `pi-mem` CLI: `~/.pi/agent/scripts/pi-mem-cli.py`, which writes SQLite databases under `~/.pi/data/memory/`.

---

## Core Concepts

- **Scopes**
  - **Project**: Memory tied to the current project root (`$(pwd)`), stored in `~/.pi/data/memory/projects/{hash}-{basename}/memory.db`.
  - **Global**: Cross-project learnings, stored in `~/.pi/data/memory/global/memory.db`.

- **Record types (project scope)**
  - **Session**: Saved project session (e.g., after finishing a task).
  - **Checkpoint**: Mid-session snapshot with a structured resume context, usually linked to a plan file.

- **Record types (global scope)**
  - **Global learning**: Cross-project patterns, preferences, and lessons with category/tags.

- **CLI contract**
  - All commands are invoked via `bash`:
    ```bash
    python3 ~/.pi/agent/scripts/pi-mem-cli.py <command> [options]
    ```
  - All commands return JSON with a top-level `status` field (`"ok"` or `"error"`).  
    Always parse and summarize JSON; never dump raw JSON to the user.

---

## Command Parsing

When the user types a `/mem` command, follow this mapping:

- `/mem`  
  → **Mode: Browse**

- `/mem "query"` (no subcommand, just a quoted or plain string)  
  → **Mode: Search** with `query = "query"`

- `/mem search "query"`  
  → **Mode: Search** with `query = "query"`

- `/mem save`  
  → **Mode: Save** with auto-generated description

- `/mem save some description here`  
  → **Mode: Save** with `description = "some description here"`

- `/mem global`  
  → **Mode: Global** (interactive description/category/tags)

- `/mem global some learning text`  
  → **Mode: Global** with initial `description = "some learning text"`; still ask for category/tags.

- `/mem checkpoint`  
  → **Mode: Checkpoint** with auto-generated description

- `/mem checkpoint description text`  
  → **Mode: Checkpoint** with `description = "description text"`

- `/mem cleanup`  
  → **Mode: Cleanup** with default threshold (7 days)

- `/mem cleanup N`  
  → **Mode: Cleanup** with threshold `N` days (1–365; clamp if outside range)

- `/mem plan path/to/plan.md`  
  → **Mode: Plan Resume** for the given `plan.md` (relative to project root)

If the input does not match any pattern above but clearly expresses intent (e.g., "save this session to memory"), map to the closest mode and explain what you are doing.

---

## Initialization and Migrations

Before using any mode that touches the database for a given scope and project, ensure the database exists and schema migrations have run.

- **Project scope (current project)**
  ```bash
  python3 ~/.pi/agent/scripts/pi-mem-cli.py init --scope project --project-path "$(pwd)"
  python3 ~/.pi/agent/scripts/pi-mem-cli.py migrate --scope project --project-path "$(pwd)"
  ```

- **Global scope**
  ```bash
  python3 ~/.pi/agent/scripts/pi-mem-cli.py init --scope global
  python3 ~/.pi/agent/scripts/pi-mem-cli.py migrate --scope global
  ```

You do not need to run `init`/`migrate` on every call; but on first use in a new environment, it is safe to run them.  
If a CLI command returns `database_not_found` or `migration_failed`, rerun `init` and `migrate`, explain the issue to the user, and retry once.

---

## Mode: Browse (no arguments)

Purpose: Show a concise overview of recent project and global memory.

Trigger: User types `/mem` with no additional arguments.

### Steps

1. Ensure databases exist and are migrated (as above).
2. Use `bash` to list recent project and global records in **parallel**:
   - Project:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py list \
       --scope project \
       --project-path "$(pwd)" \
       --limit 5
     ```
   - Global:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py list \
       --scope global \
       --limit 5
     ```
3. Parse each JSON result:
   - If `status != "ok"`, explain the error briefly and stop.
   - For project records, collect: `id`, `description`, `created_at`, `type`.
   - For global records, collect: `id`, `description`, `category`, `created_at`.

4. Present output in a compact, human-friendly format, truncating descriptions to ~80 characters:

   ```text
   ## Recent Memories

   ### Project Sessions (N)
   1. [#<id>] <description> (<date>, type: session|checkpoint)

   ### Global Learnings (M)
   1. [#<id>] <description> [category] (<date>)
   ```

   - Omit a section entirely if there are zero records for that scope.

5. Offer drill-down via `ask_user`:

   - Question:
     - "What would you like to do next?"
   - Options:
     - "View a project record"
     - "View a global learning"
     - "Search"
     - "Done"

6. If user chooses "View a project record" or "View a global learning":
   - Prompt for an ID or allow them to select from the list.
   - Call `show` (see **Display Record Details** section) and summarize the record.

7. If user chooses "Search", transition to **Mode: Search** and ask for a query string.

---

## Mode: Search

Purpose: Full-text search across project sessions/checkpoints and global learnings.

Triggers:

- `/mem "query"`
- `/mem search "query"`

### Steps

1. Extract `query` from the command.
   - If no query is provided, ask the user (via `ask_user`) "What would you like to search for?" and use that response.

2. Ensure databases are initialized and migrated.

3. Use `bash` to search both scopes in **parallel**:

   - Project:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py search \
       --scope project \
       --project-path "$(pwd)" \
       --query "<query>" \
       --limit 5
     ```

   - Global:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py search \
       --scope global \
       --query "<query>" \
       --limit 5
     ```

4. Parse JSON results:
   - Project records: `id`, `description`, `created_at`, `type`, `snippet`.
   - Global records: `id`, `description`, `category`, `created_at`, `snippet`.

5. Present results:

   ```text
   ## Search: "<query>"

   ### Project Sessions (N)
   1. [#<id>] <description> (<date>, type: session|checkpoint)
      ...<snippet>...

   ### Global Learnings (M)
   1. [#<id>] <description> [category] (<date>)
      ...<snippet>...
   ```

   - If there are no results at all, say:  
     `No memories match "<query>".`

6. Offer drill-down via `ask_user`:
   - Actions: "View project record", "View global learning", "New search", "Done".
   - Use `show` to display selected records.

---

## Mode: Save (project session)

Purpose: Save the current project session to project memory.

Triggers:

- `/mem save`
- `/mem save some description`

### Steps

1. Determine `description`:
   - If provided after `save`, use it.
   - If not, generate a short description summarizing what was accomplished in this session (1–2 sentences based on current context) and mention that it was auto-generated.

2. Construct session content to save:
   - If pi exposes a transcript file path in the environment and you know it:
     - Use `bash` to `cat` that file and pipe to CLI.
   - Otherwise:
     - Generate a concise textual summary of the session (goal, key actions, results) and pass it via stdin.  
       Prefer a non-empty summary over leaving `content` empty, so future searches have useful text to match on.

3. Ensure project database is initialized and migrated.

4. Save the session via `bash`:
   ```bash
   cat <summary_or_transcript_source> | python3 ~/.pi/agent/scripts/pi-mem-cli.py save-project \
     --project-path "$(pwd)" \
     --description "<description>"
   ```

5. Parse CLI JSON:
   - Expect on success:
     - `status: "ok"`
     - `session_id`, `description`, `files_tracked`, `chunks_stored`, `git_branch`, `git_commit`.

6. Summarize to the user:

   ```text
   Session saved.

   Description: "<description>"
   Session ID: <session_id>
   Files tracked: <files_tracked>
   Transcript chunks: <chunks_stored>
   ```

---

## Mode: Global (cross-project learning)

Purpose: Save a cross-project learning (pattern, lesson, preference, technique).

Triggers:

- `/mem global`
- `/mem global some learning text`

### Steps

1. Determine description and details:

   - If the command included text after `global`, treat that as the initial description; otherwise, ask via `ask_user`:
     - "What did you learn or want to remember for future projects?"

   - Ask for `category` using `ask_user` with options:
     - `pattern`, `preference`, `lesson`, `technique`, `general`  
       (default to `general` if no selection is made).

   - Ask for tags using `ask_user`:
     - "Tags? (comma-separated, optional)" — accept a free-form string or "No tags".

2. Generate detailed content from current session context:
   - A short paragraph or bullet list capturing:
     - The problem context.
     - The solution or learning.
     - Any caveats or tradeoffs.

3. Ensure global DB is initialized and migrated.

4. Save the learning via `bash`:
   ```bash
   echo "<detailed_content>" | python3 ~/.pi/agent/scripts/pi-mem-cli.py save-global \
     --description "<description>" \
     --category "<category>" \
     --tags "<comma,separated,tags>" \
     --source-project "$(pwd)"
   ```

5. Parse JSON response:
   - On success: `status: "ok"`, `id`, `description`, `category`, `tags`.

6. Summarize to the user:

   ```text
   Learning saved.

   ID: <id>
   Description: "<description>"
   Category: <category>
   Tags: tag1, tag2
   ```

---

## Mode: Checkpoint

Purpose: Capture a mid-session checkpoint with a structured resume context and optionally update a plan file.

Triggers:

- `/mem checkpoint`
- `/mem checkpoint some description`

### Steps

1. Determine checkpoint description:
   - Use given text if present; otherwise, auto-generate based on current progress.
   - This description will be auto-prefixed with `[CHECKPOINT]` by the CLI wrapper.

2. Build a **Resume Context** string summarizing the session state:

   ```text
   Goal: <what this work is aiming to accomplish>

   Done:
   - <completed items>

   In Progress:
   - <active tasks>

   Next:
   - <recommended next steps>

   Decisions:
   - <important technical or product decisions>

   Blockers:
   - <current blockers or "None">
   ```

3. Discover task directory (optional):
   - If there is a known task/project directory naming convention from pi (e.g., current project name), capture it as `task_dir`. If not known, leave `task_dir` empty.

4. Discover a plan file (optional but preferred):
   - Use `bash`:
     ```bash
     ls -t artifacts/plans/*.md specs/*.md 2>/dev/null | head -1
     ```
   - If a file path is found, treat it as `plan_path` (relative to project root).  
   - If no plan file is found, proceed without linking a plan (leave `plan_path` empty) and mention in the checkpoint summary that no plan is linked yet.

5. If `plan_path` exists:
   - Use `read` to load the plan file.
   - Upsert a `## Checkpoint Progress` section:
     - If it exists, replace its content; otherwise, append at the end.
     - Recommended format:

       ```markdown
       ## Checkpoint Progress

       **Last Updated:** <ISO timestamp>
       **Checkpoint ID:** <session_id or "TBD (saved after CLI call)">

       ### Completed Tasks
       - <from Done>

       ### In Progress
       - <from In Progress>

       ### Next Steps
       - <from Next>

       ### Decisions
       - <from Decisions>

       ### Blockers
       - <from Blockers>
       ```

   - After the CLI call returns a real `session_id`, you may update the `Checkpoint ID` if you want perfect traceability; this is optional.

6. Ensure project DB is initialized and migrated.

7. Save checkpoint via `bash`:
   ```bash
   echo "<resume_context>" | python3 ~/.pi/agent/scripts/pi-mem-cli.py save-checkpoint \
     --project-path "$(pwd)" \
     --description "<short_description>" \
     --task-dir "<task_dir_if_any>" \
     --resume-context "<resume_context>" \
     --plan-path "<plan_path_if_any>"
   ```

8. Parse JSON response:
   - On success: `status: "ok"`, `session_id`, `description`, `has_resume_context`, `plan_path`, etc.

9. Summarize to the user:

   ```text
   Checkpoint saved.

   Description: "<description>"
   Checkpoint ID: <session_id>
   Resume context: saved
   Plan tracked: <plan_path or "None">

   To resume later: /mem plan <plan_path>  (if a plan is linked)
   ```

---

## Mode: Cleanup

Purpose: Consolidate or delete old memory entries; prefer merging over deletion; always confirm destructive actions.

Triggers:

- `/mem cleanup`
- `/mem cleanup N` (N days)

### Steps

1. Determine threshold `N` days:
   - If user provided, clamp to `1 <= N <= 365`.
   - If omitted, default to `7`.

2. Ensure project and global DBs are initialized and migrated.

3. Use `bash` to list old records in **parallel**:

   - Project:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py list-old \
       --scope project \
       --project-path "$(pwd)" \
       --older-than-days N
     ```

   - Global:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py list-old \
       --scope global \
       --older-than-days N
     ```

4. Parse and group results by age buckets:
   - 7–14 days, 14–30 days, 30+ days, for example.
   - Present a compact summary:

     ```text
     ## Memory Cleanup (entries older than N days)

     ### Project Sessions (X)
     **7-14 days:**
     1. [#id] description (N days old, type: session|checkpoint)

     **30+ days:**
     ...

     ### Global Learnings (Y)
     ...
     ```

5. Ask user via `ask_user` which scope and action to apply:
   - "Consolidate project sessions"
   - "Consolidate global learnings"
   - "Delete specific entries"
   - "Keep all (exit)"

6. For deletions:
   - Prompt user to specify IDs to delete.
   - For each ID, ask explicit confirmation:
     - "Delete record <id>: '<description>'? (yes/no)"
   - Call `delete` via `bash`:
     ```bash
     python3 ~/.pi/agent/scripts/pi-mem-cli.py delete \
       --scope project|global \
       --project-path "$(pwd)" \
       --id "<id>"
     ```
   - Never delete without explicit confirmation.

7. For consolidations (optional initial implementation):
   - Read full details via `show` for selected groups of related entries.
   - Generate a summarized entry (project session or global learning).
   - Save the summary using `save-project` or `save-global`.
   - After the user approves the summary, delete the originals with confirmation.

8. Summarize cleanup results:

   ```text
   Cleanup complete.

   Project Sessions:
   - Consolidated: X -> Y entries
   - Deleted: Z entries

   Global Learnings:
   - Consolidated: A -> B entries
   - Deleted: C entries
   ```

---

## Mode: Plan Resume

Purpose: Resume work from a plan file with checkpoint history.

Trigger:

- `/mem plan path/to/plan.md`

### Steps

1. Normalize the plan path:
   - If a relative path is provided, treat it as relative to the current project root (`$(pwd)`).
   - Use `read` to load the plan file. If it is missing, explain the error and stop.

2. Extract and display the `## Checkpoint Progress` section if present:
   - Show last updated timestamp, checkpoint ID, and bullet lists for Completed/In Progress/Next/Decisions/Blockers.

3. Ensure project DB is initialized and migrated.

4. Use `bash` to search recent checkpoints for this plan:

   ```bash
   python3 ~/.pi/agent/scripts/pi-mem-cli.py search \
     --scope project \
     --project-path "$(pwd)" \
     --query "checkpoint" \
     --limit 5 \
     --plan-path "path/to/plan.md"
   ```

   Because checkpoint descriptions are prefixed with `[CHECKPOINT]`, searching for `"checkpoint"` will typically return only checkpoint records linked to this plan.

5. Present a summary of matching checkpoints:
   - ID, description, created_at, short snippet.

6. Ask user (via `ask_user`) what to do:
   - "Show checkpoint details"
   - "Show another checkpoint"
   - "Show plan only"
   - "Done"

7. When showing a checkpoint:
   - Call `show` with `scope=project` and the chosen `id`.
   - Present:
     - Description, date, git_branch/commit if present.
     - Resume Context (as formatted blockquote or bullet list).
     - Any plan_path and task_dir/task snapshot information from metadata.

8. Offer to propose next steps based on the plan and the checkpoint's resume context.

---

## Display Record Details

Use these patterns when the user asks to view a specific record (from Browse, Search, or Plan Resume).

### Project session or checkpoint

1. Call `show`:

   ```bash
   python3 ~/.pi/agent/scripts/pi-mem-cli.py show \
     --scope project \
     --project-path "$(pwd)" \
     --id "<id>"
   ```

2. Parse JSON:
   - `description`, `created_at`, `git_branch`, `git_commit`, `files`, `content`, `metadata`.

3. Present:
   - Basic info:
     ```text
     ID: <id>
     Description: "<description>"
     Date: <created_at>
     Git: <git_branch>@<git_commit>  (if available)
     Type: <metadata.type or "session/checkpoint">
     ```
   - If checkpoint:
     - Show "Resume Context" as a blockquote or bullet list.
     - Show `plan_path` and `task_dir` if present.
   - Show a concise summary of `content` (not the full raw text if very long).

### Global learning

1. Call `show`:

   ```bash
   python3 ~/.pi/agent/scripts/pi-mem-cli.py show \
     --scope global \
     --id <id>
   ```

2. Parse JSON:
   - `description`, `category`, `tags`, `source_project`, `created_at`, `content`.

3. Present:
   ```text
   ID: <id>
   Description: "<description>"
   Category: <category>
   Tags: tag1, tag2
   Source Project: <source_project or "Unknown">
   Date: <created_at>

   Content:
   <short excerpt of content>
   ```

---

## Key Behaviors

- Always run project + global queries in **parallel** when browsing or searching.
- Keep output concise:
  - Truncate descriptions in lists (~80 characters).
  - Use snippets or short excerpts, not full transcripts.
- Prefer saving a brief textual summary over empty content when a full transcript is not available.
- Never dump raw JSON from the CLI to the user.
- All destructive operations (deletes) require explicit, per-record confirmation via `ask_user`.
- Checkpoints should always include a meaningful resume context and, when possible, a linked `plan_path`. If no plan is found, note that explicitly.
- Plan paths should be stored and displayed as paths relative to the project root.
- When an operation fails (CLI `status != "ok"`), surface a short error message and stop rather than guessing.

---

## Report

After using this skill for any `/mem` operation, output a short completion summary including:

- **Operation**: browse, search, save, global, checkpoint, cleanup, or plan-resume.
- **Scope**: project, global, or both.
- **Records affected or viewed**:
  - For saves/checkpoints: record IDs and descriptions.
  - For search/browse: how many records listed and any that were viewed in detail.
  - For cleanup: how many records consolidated or deleted by scope.
- **Locations**:
  - Project DB path or global DB path (briefly, not full absolute path unless needed).
  - Plan path when relevant.
- **Next actions**:
  - For checkpoint/plan-resume: suggested `/mem plan path/to/plan.md`.
  - For saves: suggested `/mem` to browse or `/mem search "<key phrase>"` to find it later.

Keep this summary concise (3–8 lines), and avoid repeating large content that was already shown.
