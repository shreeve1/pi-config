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
      promptGuidelines: [
        "After searching, use web_fetch to read the full content of the 2-3 most relevant result URLs before answering. Snippets alone often miss important details.",
      ],
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
}
