---
name: ui-review
description: Review one or more web pages with screenshot-based visual analysis. Use when the user wants UI feedback, responsive layout review, visual QA, screenshot capture, or design critique for localhost pages, app routes, or full URLs.
---

# UI Review

Use this skill when the user wants visual feedback on a page or flow. It is for screenshot-driven review and responsive checks, not deep product implementation. The output should be a saved review artifact plus a concise terminal summary.

---

## What this skill produces

- Screenshots for each requested page and viewport
- A markdown report in `artifacts/ui-review/<timestamp>/report.md`
- A concise summary of the highest-priority findings

## Inputs to resolve first

Determine:
- pages to review: route paths or full URLs
- base URL if the user gives relative routes
- optional ordered interactions: click, fill, submit, hover
- optional focus areas: accessibility, spacing, responsiveness, hierarchy, polish

If the target page is unclear, use `ask_user` before doing anything else.

---

## Configuration

Look for `.pi/ui-review.json` in the working directory. If present, read it and use any of these defaults:

```json
{
  "serverCommand": "npm run dev",
  "baseUrl": "http://localhost:3000",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "outputDir": "artifacts/ui-review"
}
```

Defaults when no config exists:
- `baseUrl`: `http://localhost:3000`
- `viewports`: desktop 1440×900, tablet 768×1024, mobile 390×844
- `outputDir`: `artifacts/ui-review`

---

## Workflow

### 1. Resolve pages and URLs

Convert inputs into full URLs:
- full URLs stay as-is
- paths like `/dashboard` are appended to `baseUrl`
- bare names like `dashboard` should usually become `/dashboard`

If no page can be inferred, ask the user which page(s) to review.

### 2. Ensure the app is reachable

Use `bash` to probe the first URL.
- If it responds, continue.
- If it fails and a `serverCommand` exists, start it in the background with `bash` and poll until ready.
- If no reasonable command can be found, ask the user how to start the app.

### 3. Create the artifact directory

Use a timestamped directory:
- `artifacts/ui-review/YYYY-MM-DD-HHMMSS/`

Keep all screenshots and the final report there.

### 4. Capture screenshots

For each page, call the `ui-reviewer` agent with a single focused task that includes:
- target URL
- output directory
- page/session name
- viewport list
- ordered interactions
- whether visual analysis is requested

When multiple pages are independent, use `subagent` in parallel mode.

Recommended task shape:

```text
Capture and review this page.
URL: <full-url>
Output directory: <dir>
Session name: <page-name>
Viewports JSON: <json>
Interactions JSON: <json>
Focus: <areas>
Use /Users/james/.pi/agent/skills/ui-review/scripts/capture-ui-review.js.
Save screenshots, verify them, then analyze the screenshots.
```

### 5. Read screenshots when needed

If you need to comment on concrete visual details, use `read` on the generated image files so the screenshots are in context before making claims.

### 6. Write the review report

Create `report.md` in the output directory.

Use this structure:

```markdown
# UI Review Report

Generated: <timestamp>
Pages: <count>
Viewports: <list>

## Executive Summary
- <highest-priority finding>
- <highest-priority finding>

## Page: <name>
URL: <url>

### <viewport>
Screenshot: `<relative-path>`
- Strengths:
  - <what works>
- Issues:
  - <severity>: <problem and rationale>
- Recommendations:
  - <specific fix>

## Cross-Page Recommendations
### Critical
- <item or None>
### Warnings
- <item or None>
### Suggestions
- <item or None>
```

### 7. Respond concisely

Summarize:
- pages reviewed
- viewports captured
- artifact directory
- top findings
- report path

---

## Notes

- Prefer artifact paths over root-level screenshot folders
- If authentication blocks the page, report that explicitly
- If selectors for interactions fail, include them in the report
- If only screenshots are requested, keep analysis short and factual

## Report

After completing the skill, output:

```text
UI Review Complete
Pages Reviewed: <count>
Output Directory: <path>
Report: <path>/report.md
Top Findings:
- <finding>
- <finding>
```
