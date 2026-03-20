---
name: pi-continue
description: Resume work from a saved session using highwatermark for token-efficient context restoration
---

# Continue Session

Resume work from a previously saved pi session using highwatermark tracking. Use this skill when the user asks to continue, resume, or pick up from a prior session. Do not use this skill for fresh work with no prior session context.

---

## Variables

Compute these values at the start:

- `SESSION_REF` — optional label or ID provided by the user (may be empty)
- `PROJECT_KEY` — run `pwd | sed 's|/|-|g'` with `Bash`
- `SESSIONS_DIR` — `~/.pi/sessions/<PROJECT_KEY>`

## Phase 1 — Find Session

Use `Bash` to locate the session directory.

**If SESSION_REF was provided**, match against `meta.json` labels:

```bash
python3 -c "
import json, glob, os

sessions_dir = '<SESSIONS_DIR>'
session_ref = '<SESSION_REF>'

if not os.path.exists(sessions_dir):
    print(f'NO_SESSIONS:{sessions_dir} not found')
    exit(1)

session_dirs = glob.glob(os.path.join(sessions_dir, '*'))
matching = []

for sd in session_dirs:
    meta_file = os.path.join(sd, 'meta.json')
    if os.path.exists(meta_file):
        with open(meta_file) as f:
            meta = json.load(f)
            label = meta.get('label', '')
            session_id = meta.get('session_id', '')
            if session_ref and (session_ref in label.lower() or session_id.startswith(session_ref)):
                matching.append((meta.get('saved_at', ''), sd, meta))

matching.sort(key=lambda x: x[0], reverse=True)
print(matching[0][1] if matching else 'NO_MATCH')
"
```

**If SESSION_REF is empty**, find the most recent session:

```bash
ls -dt <SESSIONS_DIR>/*/ 2>/dev/null | head -1
```

If no sessions are found, report:
> No saved sessions found for this project. Save your current work first before resuming.

Then stop — do not proceed further.

## Phase 2 — Load Session Files

Use `Read` to load the following files from the identified session directory:

1. `meta.json` — session_id, label, saved_at, project_path, project_key, summary, last_user_message
2. `todos.json` — task array with status, content, source_agent
3. `highwatermark.json` — session_id, saved_at, tasks_summary, context_summary, last_user_message

**Backward compatibility:** If `summary` is missing from meta.json, fall back to `context_summary` from highwatermark.json. If `last_user_message` is missing from either file, display '(not recorded)'.

## Phase 3 — Present Session Summary

Display the following:

```
Resuming Session

  Session ID: <session_id>
  Label:      <label or "(none)">
  Saved:      <saved_at>
  Project:    <cwd>

  Summary:    <summary from meta.json, or fall back to context_summary from highwatermark.json>

  Last action: <last_user_message from highwatermark.json, or '(not recorded)' if missing>

Task Status

  Completed:   <n> tasks
  In Progress: <n> tasks
  Pending:     <n> tasks
```

Then list tasks grouped by status: In Progress → Pending → Completed.

## Phase 4 — Interview for Next Steps

Use `ask_user` with `type: select` to determine direction:

**If there are in_progress tasks**, ask:
> I see N tasks were in progress when this session ended. How would you like to proceed?

Options: `["Continue with in-progress tasks", "Focus on pending tasks instead", "Something new"]`

**If all tasks are completed**, ask:
> All tasks from this session were completed. What would you like to work on next?

Options: `["Start something new", "Review completed work"]`

**If only pending tasks remain**, ask:
> There are N pending tasks. How should I prioritize?

Options: `["Start on the first pending task", "Let me choose which to prioritize", "Something else"]`

Then use `ask_user` with `type: input` to ask:
> Is there anything new I should know about? (changes to requirements, new blockers, new context)

## Phase 5 — Hydrate Todos

Use `todo_write` to restore active tasks from `todos.json`. Only restore tasks with status `pending` or `in_progress` — restore them all as `pending`. Do not restore `completed` tasks.

Example `todo_write` call structure:
```json
{
  "todos": [
    { "id": "1", "content": "Task description", "status": "pending", "priority": "medium" }
  ]
}
```

## Phase 6 — Confirm Direction

Summarize the plan and get confirmation using `ask_user` with `type: confirm`:

```
Plan for This Session

  Focus:        <what we're working on>
  From previous: <what carries over>
  New context:  <anything user mentioned>

  Tasks:
  - [ ] <pending task>
  - [-] <in-progress task>

Ready to proceed?
```

If the user declines, use `ask_user` with `type: input` to ask what they'd like to do instead, then adjust.

## Report

After confirming direction, output:

```
Session Resumed

  From:         <SESSIONS_DIR>/<session_id>/
  Label:        <label>
  Saved:        <saved_at>

  Tasks Loaded: <n> active (<in-progress> in-progress, <pending> pending)

  Focus:        <what user wants to work on>

  Recent Context:
  <context_summary from highwatermark.json>

Ready to continue.
```
