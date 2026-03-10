# Web Fetch Tool

The `web_fetch` tool lets you fetch URLs and receive clean, LLM-suitable content. It handles HTML-to-text stripping, JSON pretty-printing, automatic truncation, and timeout protection — all without external dependencies.

## Overview

Pi has no native HTTP/web fetch capability. The bash tool can use `curl`, but raw HTML output wastes LLM context, and you must compose curl arguments correctly each time. The `web_fetch` tool solves this by providing:

- **Native fetch**: Uses Node.js 22 built-in fetch (no external deps)
- **Content-aware processing**: Strips HTML to text, pretty-prints JSON, preserves plain text
- **Automatic truncation**: Respects `DEFAULT_MAX_LINES` (2000) and `DEFAULT_MAX_BYTES` (~100KB) limits
- **Timeout protection**: Default 30-second timeout, configurable per request
- **Error handling**: Network errors, HTTP errors, timeouts all return useful messages (not exceptions)

## Usage

Ask the LLM to use the tool or invoke it directly:

```
Use web_fetch to fetch https://example.com
```

Or with parameters:

```
Use web_fetch to fetch https://api.example.com/data with timeout: 10
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | — | The URL to fetch (HTTP or HTTPS) |
| `timeout` | number | No | 30 | Request timeout in seconds |
| `raw` | boolean | No | false | Return raw response body (skip HTML stripping) |

## Behavior by Content Type

### HTML (`text/html`)
HTML pages are converted to readable plain text:
- Removes `<head>`, `<style>`, `<script>`, `<svg>` blocks
- Converts block-level elements (`<p>`, `<div>`, `<h1>`–`<h6>`, `<li>`, etc.) to newlines
- Removes all remaining HTML tags
- Decodes HTML entities (`&amp;`, `&lt;`, `&quot;`, `&#39;`, etc.)
- Collapses whitespace, normalizes newlines

**Example output:** Clean, readable text suitable for the LLM

**Override:** Pass `raw: true` to return the original HTML instead

### JSON (`application/json`)
JSON responses are pretty-printed (indented) for readability:

**Input:**
```json
{"user":{"name":"Alice","age":30},"active":true}
```

**Output:**
```json
{
  "user": {
    "name": "Alice",
    "age": 30
  },
  "active": true
}
```

### Plain Text & Markdown
Returned as-is without modification.

## Truncation

Output is automatically truncated to:
- **2000 lines** OR
- **~100KB** (whichever is hit first)

When truncation occurs, a notice is appended:

```
[Truncated: showing 2000 of 5000 lines (~100KB of 250KB). Use a more specific URL or raw:true for different output.]
```

This tells you:
- How many lines were shown vs. total
- How many bytes were shown vs. total
- How to get different output (more specific query or raw mode)

**Tip:** If you need specific sections of a large page, fetch with a more specific URL (e.g., filter by subdomain, port, or query parameters) or use `raw: true` to bypass HTML stripping and fetch the full page to a file.

## Error Handling

### Network Errors (DNS, connection refused, etc.)
Returns an error message with the underlying cause:

```
Fetch error: getaddrinfo ENOTFOUND nonexistent.example
```

### HTTP Errors (4xx, 5xx)
Returns the status and status text:

```
Error: HTTP 404 Not Found for https://example.com/missing
```

### Timeout
Occurs when the request exceeds the timeout duration:

```
Request timed out after 30s for https://example.com
```

**Adjust timeout:** Pass `timeout: 60` for URLs that respond slowly

## Examples

### Fetch a Documentation Page
```
Use web_fetch to fetch https://github.com/user/repo/blob/main/README.md
```

Returns: Clean, readable markdown-like text

### Fetch a JSON API
```
Use web_fetch to fetch https://api.github.com/repos/user/repo
```

Returns: Pretty-printed JSON indented for readability

### Increase Timeout for Slow Servers
```
Use web_fetch to fetch https://slow-api.example.com/data with timeout: 60
```

### Get Raw HTML (Skip Stripping)
```
Use web_fetch to fetch https://example.com with raw: true
```

Returns: Original HTML, useful if the stripping removes important formatting

## Implementation Details

### No External Dependencies
The tool uses only Node.js 22 builtins:
- `fetch()` for HTTP
- `AbortSignal.timeout()` for timeout handling
- Regex-based HTML entity decoding and tag stripping

This keeps the extension lightweight and fast — no npm installs required.

### HTML-to-Text Algorithm
The regex-based approach handles the common cases well (documentation, blog posts, API docs) but may lose formatting on complex, CSS-heavy layouts. See **Upgrade Path** below for higher-fidelity conversions.

### User-Agent Header
Requests include a User-Agent header (`Mozilla/5.0 (compatible; pi-coding-agent/1.0)`) to avoid basic bot blocks. Some sites may still block automated requests.

## Upgrade Path

If regex stripping isn't sufficient for your use case, convert the extension to a directory with external dependencies:

1. Move `~/.pi/agent/extensions/web-fetch.ts` to `~/.pi/agent/extensions/web-fetch/index.ts`
2. Create `~/.pi/agent/extensions/web-fetch/package.json`:
   ```json
   {
     "name": "web-fetch-advanced",
     "version": "1.0.0",
     "dependencies": {
       "turndown": "^7.1.1",
       "node-html-parser": "^5.3.0"
     }
   }
   ```
3. Run `npm install` in that directory
4. Update the extension to use `turndown` (HTML→Markdown) and `node-html-parser` (proper DOM parsing)

See `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/with-deps/` for a pattern.

## Troubleshooting

**Q: I got truncated output but need the full page**
- Try a more specific URL (e.g., query parameters)
- Use `raw: true` to bypass HTML stripping, then parse locally
- Use bash `curl` to save the full page to a file

**Q: HTML stripping removed important formatting**
- Pass `raw: true` to keep the original HTML
- Consider the upgrade path (see above) for turndown-based conversion

**Q: Request is timing out**
- Increase the timeout: pass `timeout: 60` or higher
- The default is 30 seconds

**Q: I'm getting a "bot blocked" error**
- Some sites block User-Agent headers or aggressive requests
- Try a direct curl via bash instead
- Check site's robots.txt for access policies

## See Also

- [Extensions Guide](extensions-guide.md) — How to build custom extensions like this one
- [Plan: Pi Web Fetch Extension](../../plans/web-fetch-extension.md) — Implementation details and architecture decisions
