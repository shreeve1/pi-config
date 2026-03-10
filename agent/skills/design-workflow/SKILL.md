---
name: design-workflow
description: Create and iterate on UI design directions before implementation. Use when the user wants mockups, theme explorations, multiple visual directions, a design gallery, or a structured UI concept workflow for an existing app or component.
---

# Design Workflow

Use this skill when the user wants to explore UI directions before building the final implementation. It is meant for generating structured design artifacts — context, variants, gallery, selection, and validation notes — not for immediately editing product code.

---

## What this skill produces

A design session under `~/artifacts/design/<date>-session-<n>/` with:
- `context/` — design brief, stack notes, constraints
- `variants/` — one folder per concept with HTML, CSS, and metadata
- `selected/` — chosen direction and follow-up notes
- `implementation/` — validation or implementation comparison notes when available

It can also produce a gallery HTML page for side-by-side review.

---

## When to use it

Use this workflow when the user asks for things like:
- “show me 3 directions”
- “mock up a new dashboard/card/modal/settings page”
- “explore themes or token-driven variants”
- “create design options before implementation”
- “turn this rough idea into reviewable UI concepts”

Do not use it when the user already knows the exact implementation they want and does not need concept exploration.

---

## Workflow

### 1. Capture the brief

Resolve:
- target feature, page, or component
- audience and core task
- constraints: framework, component library, CSS system, brand rules, accessibility needs
- number of variants requested, defaulting to 3
- fidelity: static HTML mockup, partial implementation, or critique of an existing page

If these are not clear, ask the user focused questions before generating variants.

### 2. Create a design session

Use `bash` to create a session directory with the helper in `lib/history.js`, or mirror its structure manually:
- `context/`
- `variants/`
- `selected/`
- `implementation/`

Write a short brief to `context/brief.md` and save any stack notes to `context/stack.json`. If you plan to delegate concept generation, these files are the handoff package for `mockup-designer`.

### 3. Detect the stack

Use the helper in `lib/detect-stack.js` to inspect the current project. This helps variants feel native to the codebase.

Capture:
- framework
- component library
- CSS system
- relevant dependency signals

### 4. Generate design variants

Create 2-4 distinct concepts. Each variant should have:
- a clear name
- a one-paragraph rationale
- `mockup.html`
- optional `mockup.css`
- `metadata.json`

Prefer static, reviewable HTML/CSS unless the user specifically wants framework code.

When you want cleaner separation of responsibilities, delegate variant generation to the `mockup-designer` agent. Give it the brief, stack notes, target session directory, requested variant count, and any visual constraints. Ask it to write directly into `variants/` and report the files it created.

Suggested subagent prompt shape:

```text
Create mockup variants for this design session.
Session directory: <session-dir>
Brief: <brief>
Stack notes: <json-or-summary>
Variant count: <n>
Constraints: <list>
Write each concept to <session-dir>/variants/<variant-name>/ with mockup.html, optional mockup.css, and metadata.json.
Prefer direct-open HTML/CSS mockups over framework code.
```

The bundled themes in `themes/` are starting points, not constraints:
- `brutalist.css`
- `corporate-clean.css`
- `dark-neon.css`
- `editorial.css`
- `glassmorphic.css`
- `material.css`
- `minimal-mono.css`
- `neumorphic.css`
- `organic-warm.css`
- `retro-y2k.css`

### 5. Save variant metadata

Each variant metadata file should include:

```json
{
  "name": "minimal-mono",
  "description": "Calm, dense, product-oriented direction",
  "theme": "minimal-mono",
  "agent": "design-workflow",
  "timestamp": "<iso>",
  "rationale": "Why this direction exists"
}
```

### 6. Generate the gallery

Use `bash` to run `gallery-generator.js` and produce a gallery in the session root or a `gallery/` subdirectory. The gallery lets the user compare variants quickly.

Example:

```bash
node /Users/james/.pi/agent/skills/design-workflow/gallery-generator.js \
  --mockups-dir "$SESSION_DIR/variants" \
  --output "$SESSION_DIR/gallery"
```

### 7. Review and select

Present the variants with concise trade-offs. If the user wants visual critique, use `ui-review` on the generated gallery or on individual mockups.

Then write selection notes to `selected/selection.json` or `selected/notes.md`.

### 8. Prepare handoff

When the user picks a direction, summarize:
- what was chosen
- what should carry forward into implementation
- what is intentionally out of scope
- what still needs product or design decisions

If they want implementation next, recommend using a planning or build skill after the direction is approved.

---

## Suggested variant recipe

For each concept, vary at least two of these dimensions:
- information density
- navigation emphasis
- card/chrome heaviness
- color temperature and contrast
- typography scale
- interaction affordance visibility

A good set usually includes:
1. a safe/native option
2. a bold/brand-forward option
3. a task-efficiency option

---

## Validation notes

The bundled `lib/validation.js` and `lib/vision.js` are scaffolding for post-implementation comparison. Use them as reference helpers when you want to compare a chosen mockup against a real page later.

## Report

After using this skill, output:

```text
Design Workflow Complete
Session: <path>
Variants: <count>
Gallery: <path or none>
Selected Direction: <name or pending>
Next Step:
- <recommended follow-up>
```
