---
name: pi-document
description: Extract documentation from a session or user input and save to artifacts/docs/ with navigation hub management
---

# Pi Document

Extract, organize, and save documentation to the project's `artifacts/docs/` directory structure. Works in two modes: session-based (captures knowledge from the current conversation) or input-based (documents a topic the user describes). Use this skill whenever the user asks to document something, save knowledge from a session, or create a reference doc. Do not use this skill for general file-writing tasks unrelated to documentation.

---

## Phase 1 — Determine Mode and Scope

Use `Bash` to get the current working directory: `pwd`

**If the user provided a topic or description:**
- Use it as the content to document
- Ask with `ask_user` (type: `select` or `input`) if ambiguous about:
  - Document type (guide, reference, getting-started, development)
  - Audience (new contributors, API consumers, internal team)

**If no input was given:**
- Analyze the current conversation to identify documentation-worthy content
- Look for: decisions made, architecture discussed, setup procedures, APIs described, problems solved, patterns established
- If multiple candidates exist, use `ask_user` (type: `select`) to let the user pick what to document

---

## Phase 2 — Classify the Document

Determine which `artifacts/docs/` subdirectory fits the content:

| Category | Directory | When to use |
|----------|-----------|-------------|
| Tutorial | `artifacts/docs/getting-started/` | First-time setup, onboarding, walkthroughs |
| How-to | `artifacts/docs/guides/` | Task-oriented instructions, recipes |
| Reference | `artifacts/docs/reference/` | API docs, specs, configuration options |
| Development | `artifacts/docs/development/` | Contributing guidelines, architecture, internal docs |

If content doesn't fit cleanly, use `ask_user` (type: `select`) to ask the user which category to use.

---

## Phase 3 — Examine Existing Documentation

Before writing, check what already exists:

1. Use `Bash` to check if `artifacts/docs/` exists: `ls <cwd>/artifacts/docs/ 2>/dev/null`
2. If `artifacts/docs/README.md` exists, read it with `Read` (this is the navigation hub)
3. List the target subdirectory to avoid duplicating existing docs
4. If a document on the same topic already exists, use `ask_user` (type: `select`) to ask whether to:
   - **Update** the existing document (merge new content in)
   - **Replace** it entirely
   - **Create a new** document with a different name

---

## Phase 4 — Generate the Document

Create the documentation content with this structure:

```markdown
# <Title>

<Brief description of what this document covers and who it's for>

## <Section 1>

<Content>

## <Section 2>

<Content>
```

**Writing guidelines:**
- Use clear, direct language
- Include code examples where they clarify concepts
- Use relative links to reference other project files
- Don't over-document — capture what's useful, skip what's obvious from code
- Match the tone and depth of existing docs in the project if any exist

**Filename:** Use kebab-case, descriptive names (e.g., `authentication-flow.md`, `api-endpoints.md`, `local-setup.md`)

---

## Phase 5 — Create Directory Structure

Use `Bash` to create the directory:

```bash
mkdir -p <cwd>/artifacts/docs/<category>/
```

---

## Phase 6 — Write the Document

Use `Write` to save the file to `<cwd>/artifacts/docs/<category>/<filename>.md`

---

## Phase 7 — Update Navigation Hub

**If `artifacts/docs/README.md` exists:**
- Read it with `Read`, then use `Edit` to add an entry for the new document in the appropriate section
- Maintain existing structure and formatting
- Format: `- [Title](category/filename.md) — Brief description`

**If `artifacts/docs/README.md` does not exist:**
- Use `Bash` to count total docs in `artifacts/docs/` (including the new one)
- If 3 or more docs exist, create `artifacts/docs/README.md` using `Write` as a navigation hub:

```markdown
# Documentation

## <Category>

- [Doc Title](category/filename.md) — Brief description

## <Other Category>

- [Other Doc](other-category/filename.md) — Brief description
```

- If fewer than 3 docs exist, skip creating the hub

---

## Phase 8 — Verify

1. Use `Read` to confirm the file was written and has content
2. Confirm `artifacts/docs/README.md` was updated (if applicable)
3. Confirm the file path in the navigation hub is correct

---

## Report

After completing all phases, output a summary in this format:

```
Documentation Saved

  File:     artifacts/docs/<category>/<filename>.md
  Category: <category>
  Title:    <document title>
  Lines:    <line-count>

  Navigation: artifacts/docs/README.md <updated | created | skipped (< 3 docs)>
```
