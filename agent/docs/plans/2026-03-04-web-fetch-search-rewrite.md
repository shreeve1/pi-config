# Web Fetch & Search Rewrite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Jina-backed `web_fetch` and `web_search` tools with Serper (Google search) for search and Puppeteer + Mozilla Readability for content extraction — keeping the stack pure TypeScript.

**Architecture:** `web_search` hits the Serper API with a query and returns a lightweight list of results (title, snippet, URL). `web_fetch` launches Puppeteer to load a URL (handling JS-rendered pages), extracts the main content with `@mozilla/readability` + `linkedom`, and returns markdown/text/raw. A shared, reusable Puppeteer browser instance is managed per session to avoid cold-start on every fetch.

**Tech Stack:** Puppeteer, @mozilla/readability, linkedom (DOM for Readability), Serper API (SERPER_API_KEY env var)

---

## Dependency Setup

The extension needs npm packages. We'll convert `web-fetch.ts` into a **directory-based extension** with its own `package.json`.

### Task 1: Scaffold the new extension directory

**Files:**
- Create: `~/.pi/agent/extensions/web-fetch/package.json`
- Create: `~/.pi/agent/extensions/web-fetch/index.ts` (empty placeholder)
- Remove: `~/.pi/agent/extensions/web-fetch.ts` (old single-file extension)

**Step 1: Create the package.json**

```json
{
  "name": "pi-web-fetch",
  "private": true,
  "type": "module",
  "dependencies": {
    "@mozilla/readability": "^0.6.0",
    "linkedom": "^0.18.12",
    "puppeteer": "^24.38.0"
  }
}
```

**Step 2: Create a placeholder index.ts**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Placeholder — tools registered in subsequent tasks
}
```

**Step 3: Install dependencies**

Run: `cd ~/.pi/agent/extensions/web-fetch && npm install`
Expected: `node_modules/` created with puppeteer, readability, linkedom

**Step 4: Remove old single-file extension**

Run: `rm ~/.pi/agent/extensions/web-fetch.ts`

**Step 5: Verify pi loads cleanly**

Run: `pi --help` (or quick smoke test)
Expected: No extension load errors

**Step 6: Commit**

```bash
cd ~/.pi/agent
git add extensions/web-fetch/package.json extensions/web-fetch/index.ts
git rm extensions/web-fetch.ts
git commit -m "chore: scaffold web-fetch directory extension with deps"
```

---

### Task 2: Implement the Puppeteer browser manager

**Files:**
- Create: `~/.pi/agent/extensions/web-fetch/browser.ts`

A shared browser instance that lazy-launches on first use and shuts down on session end. Reusing a browser avoids ~2s cold-start per fetch.

**Step 1: Write browser.ts**

```typescript
import puppeteer, { type Browser } from "puppeteer";

let browser: Browser | null = null;

/**
 * Get or launch a shared headless browser.
 * Callers should NOT close this — it's managed per-session.
 */
export async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    return browser;
  }
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  });
  return browser;
}

/**
 * Shut down the shared browser. Call on session_shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Already closed
    }
    browser = null;
  }
}
```

**Step 2: Verify it compiles**

Run: `cd ~/.pi/agent/extensions/web-fetch && npx tsc --noEmit --moduleResolution bundler --module ESNext --target ES2020 --strict --skipLibCheck browser.ts`
Expected: No errors (or only type-resolution warnings that jiti handles)

**Step 3: Commit**

```bash
cd ~/.pi/agent
git add extensions/web-fetch/browser.ts
git commit -m "feat: add shared puppeteer browser manager"
```

---

### Task 3: Implement the content extractor

**Files:**
- Create: `~/.pi/agent/extensions/web-fetch/extract.ts`

Takes raw HTML + URL, runs it through Readability to extract article content, returns markdown or plain text.

**Step 1: Write extract.ts**

```typescript
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface ExtractedContent {
  title: string;
  content: string;       // Cleaned text content
  excerpt: string;
  byline: string;
  siteName: string;
}

/**
 * Extract main content from HTML using Mozilla Readability.
 * Returns null if Readability can't parse the page (not article-like).
 */
export function extractContent(html: string, url: string): ExtractedContent | null {
  const { document } = parseHTML(html);

  const reader = new Readability(document as any, { url });
  const article = reader.parse();

  if (!article) {
    return null;
  }

  return {
    title: article.title ?? "",
    content: article.textContent ?? "",
    excerpt: article.excerpt ?? "",
    byline: article.byline ?? "",
    siteName: article.siteName ?? "",
  };
}

/**
 * Convert Readability's HTML content to simple markdown.
 * Readability returns cleaned HTML — this converts it to markdown for LLM consumption.
 */
export function extractContentAsMarkdown(html: string, url: string): ExtractedContent | null {
  const { document } = parseHTML(html);

  const reader = new Readability(document as any, { url });
  const article = reader.parse();

  if (!article) {
    return null;
  }

  // article.content is cleaned HTML — convert to markdown
  const markdown = htmlToMarkdown(article.content ?? "");

  return {
    title: article.title ?? "",
    content: markdown,
    excerpt: article.excerpt ?? "",
    byline: article.byline ?? "",
    siteName: article.siteName ?? "",
  };
}

// --- Minimal HTML-to-Markdown for Readability's cleaned output ---
// Readability strips boilerplate, so this only handles content-level tags.

function htmlToMarkdown(html: string): string {
  let text = html;

  // Code blocks
  text = text.replace(
    /<pre[^>]*><code(?:\s+class="language-(\w+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_, lang, code) => `\n\`\`\`${lang || ""}\n${decodeEntities(code).trim()}\n\`\`\`\n`,
  );
  text = text.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, content) => `\n\`\`\`\n${decodeEntities(content).trim()}\n\`\`\`\n`,
  );

  // Headings
  for (let i = 1; i <= 6; i++) {
    const hashes = "#".repeat(i);
    text = text.replace(new RegExp(`<h${i}[^>]*>(.*?)<\\/h${i}>`, "gi"), `\n${hashes} $1\n`);
  }

  // Bold, italic, inline code
  text = text.replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, "**$1**");
  text = text.replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, "*$1*");
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  // Links and images
  text = text.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  text = text.replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  text = text.replace(/<img[^>]*src="([^"]+)"[^>]*\/?>/gi, "![]($1)");

  // Blockquotes
  text = text.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_, content) =>
      content.split("\n").map((l: string) => `> ${l}`).join("\n"),
  );

  // Lists
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, "$1");
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let counter = 0;
    return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_li: unknown, liContent: string) => {
      counter++;
      return `${counter}. ${liContent}\n`;
    });
  });

  // Horizontal rules, line breaks, paragraphs
  text = text.replace(/<hr\s*\/?>/gi, "\n---\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode entities
  text = decodeEntities(text);

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.split("\n").map((line) => line.trim()).join("\n");

  return text.trim();
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
```

**Step 2: Verify it compiles**

Run: `cd ~/.pi/agent/extensions/web-fetch && npx tsc --noEmit --moduleResolution bundler --module ESNext --target ES2020 --strict --skipLibCheck extract.ts`
Expected: No errors

**Step 3: Commit**

```bash
cd ~/.pi/agent
git add extensions/web-fetch/extract.ts
git commit -m "feat: add Readability-based content extraction"
```

---

### Task 4: Implement the `web_fetch` tool

**Files:**
- Modify: `~/.pi/agent/extensions/web-fetch/index.ts`

Uses Puppeteer to load the page, waits for content, extracts with Readability, applies truncation.

**Step 1: Write the web_fetch tool in index.ts**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getBrowser, closeBrowser } from "./browser.js";
import { extractContent, extractContentAsMarkdown } from "./extract.js";

// --- Configuration ---
const SERPER_API_KEY = process.env.SERPER_API_KEY ?? "";
const HAS_SERPER = SERPER_API_KEY.length > 0;

// --- Truncation helper ---
function applyTruncation(text: string): { output: string; truncated: boolean } {
  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let output = truncation.content;
  if (truncation.truncated) {
    output += `\n\n[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use a more specific URL or format:raw for different output.]`;
  }

  return { output, truncated: truncation.truncated };
}

// --- Schemas ---
type OutputFormat = "markdown" | "text" | "raw";

const WebFetchParams = Type.Object({
  url: Type.String({ description: "The URL to fetch" }),
  format: Type.Optional(
    Type.Union(
      [Type.Literal("markdown"), Type.Literal("text"), Type.Literal("raw")],
      { description: "Output format: markdown (default, preserves structure), text (plain), or raw (no processing)" },
    ),
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Request timeout in seconds (default: 30)" }),
  ),
});

interface WebFetchDetails {
  url: string;
  statusCode?: number;
  contentType?: string;
  truncated?: boolean;
  format: OutputFormat;
  title?: string;
}

export default function (pi: ExtensionAPI) {
  // Shut down browser on session end
  pi.on("session_shutdown", async () => {
    await closeBrowser();
  });

  // ==================== web_fetch ====================
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: `Fetch a URL and return its content. Uses a headless browser for JS-rendered pages. HTML pages are converted to markdown (default) or plain text via Mozilla Readability; JSON is pretty-printed. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first). Use for reading documentation, web pages, and API endpoints.`,
    parameters: WebFetchParams,

    async execute(_toolCallId, params) {
      const { url, format = "markdown", timeout: timeoutSec = 30 } = params as {
        url: string;
        format?: OutputFormat;
        timeout?: number;
      };

      const details: WebFetchDetails = { url, format };

      // Validate URL
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          content: [{ type: "text", text: `Error: Invalid URL (must start with http:// or https://): ${url}` }],
          details,
          isError: true,
        };
      }

      try {
        const browser = await getBrowser();
        const page = await browser.newPage();

        try {
          // Set a reasonable viewport and user agent
          await page.setViewport({ width: 1280, height: 800 });
          await page.setUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
          );

          // Navigate with timeout
          const response = await page.goto(url, {
            waitUntil: "networkidle2",
            timeout: timeoutSec * 1000,
          });

          details.statusCode = response?.status();
          details.contentType = response?.headers()["content-type"] ?? undefined;

          if (response && !response.ok()) {
            return {
              content: [{ type: "text", text: `Error: HTTP ${response.status()} for ${url}` }],
              details,
              isError: true,
            };
          }

          // Get page content
          const html = await page.content();
          const ct = details.contentType ?? "";

          let text: string;

          if (format === "raw") {
            text = html;
          } else if (ct.includes("application/json")) {
            // JSON — get body text and pretty-print
            const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
            try {
              text = JSON.stringify(JSON.parse(bodyText), null, 2);
            } catch {
              text = bodyText;
            }
          } else {
            // HTML — extract with Readability
            if (format === "markdown") {
              const extracted = extractContentAsMarkdown(html, url);
              if (extracted) {
                details.title = extracted.title;
                text = extracted.title
                  ? `# ${extracted.title}\n\n${extracted.content}`
                  : extracted.content;
              } else {
                // Readability couldn't parse — fall back to page text
                text = await page.evaluate(() => document.body?.innerText ?? "");
              }
            } else {
              // format === "text"
              const extracted = extractContent(html, url);
              if (extracted) {
                details.title = extracted.title;
                text = extracted.title
                  ? `${extracted.title}\n\n${extracted.content}`
                  : extracted.content;
              } else {
                text = await page.evaluate(() => document.body?.innerText ?? "");
              }
            }
          }

          const { output, truncated } = applyTruncation(text);
          details.truncated = truncated;

          return {
            content: [{ type: "text", text: output }],
            details,
          };
        } finally {
          await page.close();
        }
      } catch (err: any) {
        if (err.name === "TimeoutError") {
          return {
            content: [{ type: "text", text: `Request timed out after ${timeoutSec}s for ${url}` }],
            details,
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Fetch error: ${err.message}` }],
          details,
          isError: true,
        };
      }
    },
  });

  // web_search registered in next task...
}
```

**Step 2: Verify the extension loads**

Run: `pi -e ~/.pi/agent/extensions/web-fetch --help`
Expected: No load errors

**Step 3: Commit**

```bash
cd ~/.pi/agent
git add extensions/web-fetch/index.ts
git commit -m "feat: implement web_fetch with Puppeteer + Readability"
```

---

### Task 5: Implement the `web_search` tool

**Files:**
- Modify: `~/.pi/agent/extensions/web-fetch/index.ts`

Hits Serper API, returns a lightweight list of results.

**Step 1: Add the Serper search helper and web_search tool**

Add to `index.ts`, after the `web_fetch` tool registration but before the closing `}` of the default export:

```typescript
  // ==================== web_search ====================
  if (HAS_SERPER) {
    const WebSearchParams = Type.Object({
      query: Type.String({ description: "Search query" }),
      numResults: Type.Optional(
        Type.Number({ description: "Number of results to return (default: 10, max: 20)" }),
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Request timeout in seconds (default: 30)" }),
      ),
    });

    interface SearchResult {
      title: string;
      url: string;
      snippet: string;
      position: number;
    }

    interface WebSearchDetails {
      query: string;
      resultCount: number;
    }

    pi.registerTool({
      name: "web_search",
      label: "Web Search",
      description: `Search the web and return results. Returns up to 10 results with title, URL, and snippet. Powered by Google via Serper API. Use web_fetch to read the full content of any result URL.`,
      parameters: WebSearchParams,

      async execute(_toolCallId, params) {
        const {
          query,
          numResults = 10,
          timeout: timeoutSec = 30,
        } = params as {
          query: string;
          numResults?: number;
          timeout?: number;
        };

        const details: WebSearchDetails = { query, resultCount: 0 };

        try {
          const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": SERPER_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: query,
              num: Math.min(numResults, 20),
            }),
            signal: AbortSignal.timeout(timeoutSec * 1000),
          });

          if (!res.ok) {
            return {
              content: [{ type: "text", text: `Serper API error: HTTP ${res.status} ${res.statusText}` }],
              details,
              isError: true,
            };
          }

          const data = await res.json() as {
            organic?: Array<{
              title: string;
              link: string;
              snippet: string;
              position: number;
            }>;
            knowledgeGraph?: {
              title?: string;
              description?: string;
              descriptionLink?: string;
            };
            answerBox?: {
              title?: string;
              answer?: string;
              snippet?: string;
              link?: string;
            };
          };

          const results: SearchResult[] = (data.organic ?? []).map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
            position: r.position,
          }));

          details.resultCount = results.length;

          if (results.length === 0) {
            return {
              content: [{ type: "text", text: `No results found for: ${query}` }],
              details,
            };
          }

          // Build compact output
          const parts: string[] = [];
          parts.push(`# Search: ${query}\n`);

          // Include answer box if present
          if (data.answerBox) {
            const ab = data.answerBox;
            parts.push(`**Answer:** ${ab.answer || ab.snippet || ab.title || ""}`);
            if (ab.link) parts.push(`Source: ${ab.link}`);
            parts.push("");
          }

          // Include knowledge graph if present
          if (data.knowledgeGraph?.description) {
            parts.push(`**${data.knowledgeGraph.title || "Info"}:** ${data.knowledgeGraph.description}`);
            parts.push("");
          }

          // Results list
          for (const r of results) {
            parts.push(`${r.position}. **${r.title}**`);
            parts.push(`   ${r.url}`);
            parts.push(`   ${r.snippet}`);
            parts.push("");
          }

          const output = parts.join("\n");

          return {
            content: [{ type: "text", text: output }],
            details,
          };
        } catch (err: any) {
          if (err.name === "TimeoutError" || err.name === "AbortError") {
            return {
              content: [{ type: "text", text: `Search timed out after ${timeoutSec}s for: ${query}` }],
              details,
              isError: true,
            };
          }

          return {
            content: [{ type: "text", text: `Search error: ${err.message}` }],
            details,
            isError: true,
          };
        }
      },
    });
  }
```

**Step 2: Verify the extension loads**

Run: `SERPER_API_KEY=test pi --help`
Expected: No load errors

**Step 3: Commit**

```bash
cd ~/.pi/agent
git add extensions/web-fetch/index.ts
git commit -m "feat: implement web_search with Serper API"
```

---

### Task 6: Manual smoke test

**Files:** None (testing only)

**Step 1: Test web_fetch**

Start pi and ask it to fetch a simple page:
```
Fetch https://example.com and show me the content
```
Expected: Puppeteer loads the page, Readability extracts content, returns markdown

**Step 2: Test web_fetch with a JS-rendered page**

```
Fetch https://news.ycombinator.com and show me the content
```
Expected: Puppeteer renders JS, returns the full page content (not empty/partial)

**Step 3: Test web_search (requires SERPER_API_KEY)**

```
Search the web for "TypeScript puppeteer readability content extraction"
```
Expected: Returns a compact list with titles, URLs, and snippets — no full page content

**Step 4: Test web_fetch on a search result URL**

Pick one of the URLs from the search results and ask pi to fetch it.
Expected: Full content extracted via Readability

**Step 5: Test edge cases**

- Fetch a JSON API endpoint (e.g., `https://api.github.com/zen`) — should pretty-print
- Fetch with `format: raw` — should return raw HTML
- Fetch an invalid URL — should return a clear error
- Fetch a page that times out — should return timeout error

**Step 6: Commit (if any fixes needed)**

```bash
cd ~/.pi/agent
git add -A extensions/web-fetch/
git commit -m "fix: address smoke test findings"
```

---

### Task 7: Cleanup and final commit

**Files:**
- Verify: `~/.pi/agent/extensions/web-fetch/index.ts` — no Jina references remain
- Verify: `~/.pi/agent/extensions/web-fetch.ts` — deleted

**Step 1: Verify no Jina references**

Run: `grep -r "jina\|JINA" ~/.pi/agent/extensions/web-fetch/`
Expected: No matches

**Step 2: Verify old file is gone**

Run: `ls ~/.pi/agent/extensions/web-fetch.ts`
Expected: "No such file"

**Step 3: Verify extension directory structure**

Run: `find ~/.pi/agent/extensions/web-fetch -not -path "*/node_modules/*" -not -path "*/.cache/*"`
Expected:
```
extensions/web-fetch/
extensions/web-fetch/package.json
extensions/web-fetch/package-lock.json
extensions/web-fetch/index.ts
extensions/web-fetch/browser.ts
extensions/web-fetch/extract.ts
```

**Step 4: Final commit**

```bash
cd ~/.pi/agent
git add -A
git commit -m "feat: replace Jina with Puppeteer + Serper for web tools

- web_search: Serper API (Google results) — returns title, snippet, URL
- web_fetch: Puppeteer + Mozilla Readability — handles JS-rendered pages
- Dropped Jina dependency entirely
- Shared browser instance with session lifecycle management"
```

---

## Summary

| Task | What | Depends On |
|------|------|-----------|
| 1 | Scaffold extension directory + deps | — |
| 2 | Browser manager (Puppeteer lifecycle) | 1 |
| 3 | Content extractor (Readability + HTML→MD) | 1 |
| 4 | `web_fetch` tool | 2, 3 |
| 5 | `web_search` tool (Serper) | 4 |
| 6 | Smoke test | 5 |
| 7 | Cleanup + final commit | 6 |

Tasks 2 and 3 can be parallelized. Everything else is sequential.
