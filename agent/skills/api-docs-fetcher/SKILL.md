---
name: api-docs-fetcher
description: Fetches API documentation from a URL or existing spec, restructures it into an LLM-friendly `apidocs/` directory, and generates per-resource reference files plus a navigable index. Use when the user asks to pull API docs, download an OpenAPI or Swagger spec, turn developer portal docs into local markdown, build an API reference set, or organize external API documentation for later lookup.
---

# API Docs Fetcher

Use this skill when the user wants API documentation gathered from a URL, repository, or machine-readable spec and saved locally in a structured `apidocs/` folder. Prefer other skills when the task is ordinary web research, one-off endpoint lookup, or documenting an API that already lives in the current codebase.

---

## Phase 1 — Confirm source and target

Start by identifying the documentation source and the output location.

1. Extract the source URL or file path from the user's request.
2. If the source is missing or ambiguous, ask with `ask_user`.
3. Use `Bash` to inspect the current working directory.
4. Default the output directory to `./apidocs/` unless the user specifies another location.
5. If the target directory already exists, inspect it first and ask with `ask_user` whether to merge, replace, or write into a different directory.

Use this quick classification:

- `*.yaml`, `*.yml`, `*.json` that look like API specs → OpenAPI/Swagger path
- GitHub repository or docs tree → repository docs path
- Developer portal URLs such as `/docs`, `/developer`, `/reference`, `/api` → portal path
- Everything else → generic documentation scrape

## Phase 2 — Inspect the source

Use the most direct tool that preserves the source faithfully. If the request is substantial, such as a full developer portal crawl or a large OpenAPI conversion, delegate the extraction work to the `api-docs-fetcher` agent with `subagent` so the main session can coordinate and review results.

### Remote sources

- Use `web_fetch` for URLs when the task is small or you only need to inspect a few pages directly.
- For search-driven discovery, use `web_search` first, then `web_fetch` the most relevant result pages.
- If the initial page is a portal index, identify likely child pages worth following before writing files.
- For multi-page extraction, call `subagent` with `agent: "api-docs-fetcher"` and give it the source plus the desired output directory.

Example delegation:

```json
{
  "agent": "api-docs-fetcher",
  "task": "Fetch API documentation from https://api.example.com/docs and generate a grounded apidocs/ directory in the current project. Preserve source snapshots, create per-resource markdown files, add cross-cutting reference docs, and report file counts plus any gaps.",
  "agentScope": "user"
}
```

### Local sources

- Use `Read` for local spec or markdown files.
- Use `Bash` to list sibling files when the provided path is part of a docs tree.

If the source cannot be read, stop and report what failed, what you tried, and what the user can provide next.

## Phase 3 — Build the documentation plan

Before writing, decide what should be generated.

Create this structure unless the source is too small to justify every file:

```text
apidocs/
├── README.md
├── source/
│   └── <original files or fetched snapshots>
├── resources/
│   └── <resource>.md
└── reference/
    ├── authentication.md
    ├── endpoints.md
    ├── pagination.md
    ├── rate-limits.md
    └── filtering-and-sorting.md
```

Adjust the plan to fit the source:

- If the API has no pagination, omit `pagination.md`.
- If auth details are absent, still create `authentication.md` and clearly mark unknowns.
- If the docs are tiny, a smaller set of resource files is better than invented detail.

## Phase 4 — Preserve the original material

Create the destination directories with `Bash`.

Save the original material in `apidocs/source/` so later sessions can inspect the raw input:

- Remote spec file → save the fetched content with `Write`
- Remote HTML or markdown docs → save snapshots with descriptive filenames
- Local files → copy them with `Bash` or summarize their location in `apidocs/source/README.md` if copying is unnecessary

Preserving source material makes it easier to verify generated docs and fill gaps later.

## Phase 5 — Generate resource documentation

Organize endpoints by resource rather than by one giant file.

For OpenAPI and Swagger specs:

1. Save the source spec into `apidocs/source/` first.
2. When the spec is local, or once a remote spec has been saved locally, use `Bash` to run `./scripts/openapi_summary.py <spec-file>` from this skill directory to produce a structured summary.
3. Identify paths, methods, tags, operation summaries, parameters, request bodies, and notable responses.
4. Group endpoints by the best available resource signal in this order:
   - tag
   - first path segment
   - operationId prefix
5. Create one markdown file per resource in `apidocs/resources/`.

The helper script gives you a deterministic inventory of resources and endpoints so you spend less time manually re-parsing large specs. Read `references/openapi-summary-schema.md` when you need the exact JSON shape or want to map fields into markdown templates.

For portal or repository docs:

1. Identify navigation pages and endpoint reference pages.
2. Follow the most relevant child pages with `web_fetch`.
3. Extract concrete endpoint information only when it is actually present.
4. If a page is conceptual and contains no endpoint details, summarize it in a reference file instead of pretending it is a resource page.

Use this format for resource files:

```markdown
# <Resource name>

**Base Path:** `/resource`
**Methods:** `GET`, `POST`

## Endpoints

### GET /resource
<Short purpose>

**Parameters**
- `page` — optional integer
- `filter[name]` — optional string

**Request Body**
- Describe only if present

**Responses**
- `200` — success summary
- `400` — validation or bad request summary

**Example**
```bash
curl -X GET "https://api.example.com/resource" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
```

Be explicit about unknowns. It is better to write "Not documented in source" than to infer behavior.

## Phase 6 — Generate cross-cutting reference guides

Create reference files only for patterns that the source actually supports.

Recommended reference topics:

- `authentication.md`
- `endpoints.md`
- `pagination.md`
- `rate-limits.md`
- `filtering-and-sorting.md`
- `errors.md`

Each reference file should explain the pattern, give examples when available, and distinguish documented facts from educated summaries.

Use this format:

```markdown
# <Topic>

## What the docs say

<Grounded summary>

## Examples

<Concrete examples from the source when available>

## Gaps or caveats

<Unknowns, inconsistencies, or assumptions>
```

## Phase 7 — Write the main index

Create `apidocs/README.md` as the entry point.

Include:

1. Source URL or source file path
2. What kind of source was processed
3. Directory map
4. Resource table with links
5. Cross-cutting reference files with links
6. Quick-start notes such as base URL, auth scheme, and common headers if known
7. A short section describing missing or uncertain areas

A concise table works well:

```markdown
| Resource | Base Path | Methods | File |
|---|---|---|---|
| Organizations | `/organizations` | GET, POST | `resources/organizations.md` |
```

## Phase 8 — Verify before reporting completion

Use `Bash` and `Read` to verify what was actually created.

Check:

- destination directories exist
- every linked file in `README.md` exists
- resource files contain endpoint headings, not empty placeholders
- reference files do not claim facts absent from the source
- the file count and major resources match what you observed during extraction

If the docs were only partially recoverable, say so plainly and list the gaps.

## Output format

When the work is done, report with concrete evidence:

```text
✓ Source inspected: <url or path>
✓ Output directory: <path>
✓ Resource files: <count>
✓ Reference files: <count>
✓ Saved source snapshots: <count>

Start here: <path>/README.md

Key resources:
- <resource> — <base path>
- <resource> — <base path>

Notes:
- <missing auth details / pagination not documented / portal required manual interpretation>
```

## Practical guidance

- Prefer grounded extraction over exhaustive guessing.
- Save raw source material before heavily summarizing it.
- When a portal is broad, prioritize endpoint reference pages over marketing or getting-started copy.
- If repeated scraping or transformation steps become tedious, use `Bash` for deterministic local processing after you have fetched the source.
- If the source is too large to finish in one pass, document what was completed and what remains instead of claiming full coverage.

## Report

After completing the skill's work, summarize what was fetched, where it was saved, and which files the user should open first. If you delegated the extraction with `subagent`, review the subagent's output before presenting the final summary.
