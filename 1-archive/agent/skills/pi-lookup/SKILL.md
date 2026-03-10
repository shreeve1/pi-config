---
name: pi-lookup
description: Search the persistent knowledge base for previously saved information about infrastructure, clients, projects, runbooks, or any stored context.
---

# Pi Lookup — Search Knowledge Base

Use this skill to recall information saved in prior sessions via `save_to_memory`.

## When to Use

- User asks "do you know anything about X", "what do we have on Y", "look up Z"
- About to work on a known topic (infra, client, project) and want prior context
- Troubleshooting and checking for saved runbooks or notes

## How to Search

Run 2–3 targeted queries rather than one broad one — the vector search works best with specific terms.

```
search_knowledge("proxmox node setup")
search_knowledge("proxmox networking vlan")
```

Prefer specific terms over vague ones (`nginx reverse proxy config` beats `server stuff`).

## Report Back

Summarise what was found — don't just dump raw chunks. If nothing relevant is found, say so clearly and suggest using `pi-save` to store it next time.
