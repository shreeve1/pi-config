---
name: pi-save-session
description: Save current session todos and highwatermark to ~/.pi/sessions/ for token-efficient resume
---

# Pi Save Session

Save the current session's todo state and a highwatermark to a centralized location so work can be resumed efficiently in a new session. Use this when the conversation is getting long, a task is pausing, or the user explicitly asks to save the session. Do not use this unless the user wants to checkpoint or resume later.

---

## Variables

Compute these values before starting:

- `PROJECT_CWD` — result of `pwd`
- `PROJECT_KEY` — `pwd | sed 's|/|-|g'` (leading `-` is fine)
- `SESSION_LABEL` — optional label passed by the user (may be empty)
- `SESSIONS_DIR` — `~/.pi/sessions/<PROJECT_KEY>`
- `LAST_USER_MESSAGE` — the user's most recent substantive message/request in the conversation

---

## Phase 1 — Find Current Session

Pi stores the current session todo list in memory (accessible via `todo_read`). There is no JSONL transcript file to scan — pi does not expose raw transcripts.

Use `todo_read` to capture the current todo list now. Store the result as `current_todos`.

If `todo_read` returns an empty list, note that no active todos exist.

---

## Phase 2 — Create Session Directory

Use `Bash` to create the session directory:

```bash
SESSION_ID=$(date +%Y%m%d-%H%M%S)
PROJECT_KEY=$(pwd | sed 's|/|-|g')
mkdir -p ~/.pi/sessions/${PROJECT_KEY}/${SESSION_ID}
echo $SESSION_ID
echo $PROJECT_KEY
```

Capture `SESSION_ID` and `PROJECT_KEY` from the output. All subsequent files go under `~/.pi/sessions/<PROJECT_KEY>/<SESSION_ID>/`.

---

## Phase 3 — Write todos.json

Use `Bash` with `python3` to write `todos.json` from the `todo_read` output:

```bash
python3 -c "
import json, datetime

todos = <PASTE_TODOS_AS_JSON_STRING>

output = {
    'session_id': '<SESSION_ID>',
    'saved_at': datetime.datetime.now().isoformat(),
    'tasks': todos
}

path = '<SESSIONS_DIR>/<SESSION_ID>/todos.json'
with open(path, 'w') as f:
    json.dump(output, f, indent=2)

by_status = {}
for t in todos:
    s = t.get('status', 'unknown')
    by_status[s] = by_status.get(s, 0) + 1
print(json.dumps(by_status))
"
```

Replace `<PASTE_TODOS_AS_JSON_STRING>` with the actual JSON array returned by `todo_read`. Capture the status counts for the report.

---

## Phase 4 — Write meta.json

Use `Bash` with `python3` to write `meta.json`:

```bash
python3 -c "
import json, datetime

output = {
    'session_id': '<SESSION_ID>',
    'label': '<SESSION_LABEL>',
    'project_path': '<PROJECT_CWD>',
    'project_key': '<PROJECT_KEY>',
    'saved_at': datetime.datetime.now().isoformat(),
    'summary': '<BRIEF_PROSE_SUMMARY_OF_SESSION_STATE>',
    'last_user_message': '<LAST_USER_MESSAGE>'
}

with open('<SESSIONS_DIR>/<SESSION_ID>/meta.json', 'w') as f:
    json.dump(output, f, indent=2)

print('meta saved')
"
```

Replace `<BRIEF_PROSE_SUMMARY_OF_SESSION_STATE>` with a 1–3 sentence summary of what was accomplished and what is pending. Replace `<LAST_USER_MESSAGE>` with the user's most recent substantive request. Escape any quotes for valid Python string embedding.

---

## Phase 5 — Write highwatermark.json

Pi does not expose a raw transcript. Instead, record a prose summary of where the session stands — what was accomplished, what is in-flight, and what remains. Use your knowledge of the conversation to write this.

Use `Bash` with `python3`:

```bash
python3 -c "
import json, datetime

# Load task summary
try:
    with open('<SESSIONS_DIR>/<SESSION_ID>/todos.json') as f:
        todos = json.load(f)
    by_status = {}
    for t in todos.get('tasks', []):
        s = t.get('status', 'unknown')
        by_status[s] = by_status.get(s, 0) + 1
except:
    by_status = {}

output = {
    'session_id': '<SESSION_ID>',
    'saved_at': datetime.datetime.now().isoformat(),
    'tasks_summary': by_status,
    'context_summary': '<BRIEF_PROSE_SUMMARY_OF_SESSION_STATE>',
    'last_user_message': '<LAST_USER_MESSAGE>'
}

with open('<SESSIONS_DIR>/<SESSION_ID>/highwatermark.json', 'w') as f:
    json.dump(output, f, indent=2)

print('highwatermark saved')
"
```

Replace `<BRIEF_PROSE_SUMMARY_OF_SESSION_STATE>` with a 1–3 sentence summary of what was accomplished and what is pending. Replace `<LAST_USER_MESSAGE>` with the user's most recent substantive request. Escape any quotes for valid Python string embedding.

---

## Phase 6 — Validate

Use `Bash` to confirm all three files exist and are valid JSON:

```bash
for f in meta.json todos.json highwatermark.json; do
    path="$HOME/.pi/sessions/<PROJECT_KEY>/<SESSION_ID>/$f"
    if python3 -c "import json; json.load(open('$path'))" 2>/dev/null; then
        echo "OK: $f"
    else
        echo "INVALID: $f"
    fi
done
```

If any file is INVALID, re-write it with corrected content before proceeding.

---

## Phase 7 — Instruct User

After saving, tell the user:

> Session saved. To start fresh, start a new pi session in the same directory.
> Your saved session is at: `~/.pi/sessions/<PROJECT_KEY>/<SESSION_ID>/`

**Do NOT attempt to clear the conversation yourself** — only the user can do that.

---

## Report

```
Session Saved

  Session ID:  <SESSION_ID>
  Location:    ~/.pi/sessions/<PROJECT_KEY>/<SESSION_ID>/
  Label:       <SESSION_LABEL or "(none)">
  Project:     <PROJECT_CWD>

  Tasks:       <completed> done, <in_progress> active, <pending> pending

Files written:
  - meta.json
  - todos.json
  - highwatermark.json

To resume: reference the session directory in a new pi session and read highwatermark.json for context.
```

If no todos were found:
```
  Tasks:       (none active)
```
