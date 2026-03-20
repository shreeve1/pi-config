import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface ExtractedContent {
  title: string;
  content: string;
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
