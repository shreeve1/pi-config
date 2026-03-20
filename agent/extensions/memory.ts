import { Type } from "@mariozechner/pi-ai";
import { readFileSync, writeFileSync, existsSync, mkdirSync, createHash } from "fs";
import { homedir } from "os";
import { join } from "path";

// --- Configuration ---
const OLLAMA_URL = "http://localhost:11434/api/embed";
const EMBED_MODEL = "nomic-embed-text";
const INDEX_DIR = join(homedir(), ".pi", "memory");
const INDEX_PATH = join(INDEX_DIR, "librarian_index.json");
const CHUNK_SIZE = 250;
const CHUNK_OVERLAP = 50;
const TOP_K = 5;

// --- Types ---
interface MemoryIndex {
  chunks: string[];
  embeddings: number[][];
  sources: string[];
  hashes: string[];
}

// --- Utility functions ---
function hashChunk(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadIndex(): MemoryIndex {
  if (!existsSync(INDEX_DIR)) mkdirSync(INDEX_DIR, { recursive: true });
  if (!existsSync(INDEX_PATH)) {
    return { chunks: [], embeddings: [], sources: [], hashes: [] };
  }
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as MemoryIndex;
  // Backfill hashes for indexes created before deduplication was added
  if (!index.hashes) {
    index.hashes = index.chunks.map(hashChunk);
  }
  return index;
}

function saveIndex(index: MemoryIndex) {
  if (!existsSync(INDEX_DIR)) mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(index));
}

async function getEmbedding(text: string): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
  } catch (e) {
    throw new Error(`Could not reach Ollama at ${OLLAMA_URL}. Is it running? (${e})`);
  }
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.embeddings?.[0]) {
    throw new Error(`Ollama response missing embeddings. Model "${EMBED_MODEL}" may not be pulled. Run: ollama pull ${EMBED_MODEL}`);
  }
  return data.embeddings[0];
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  let res: Response;
  try {
    res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });
  } catch (e) {
    throw new Error(`Could not reach Ollama at ${OLLAMA_URL}. Is it running? (${e})`);
  }
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.embeddings) {
    throw new Error(`Ollama response missing embeddings. Model "${EMBED_MODEL}" may not be pulled. Run: ollama pull ${EMBED_MODEL}`);
  }
  return data.embeddings;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (chunk.trim().length > 0) chunks.push(chunk);
  }
  return chunks;
}

// --- Extension entry point ---
export default function (pi: any) {

  // Tool 1: Search the knowledge base
  pi.registerTool({
    name: "search_knowledge",
    description:
      "Search the persistent knowledge base for relevant information. " +
      "Use this when you need context about the user's infrastructure, " +
      "documentation, client environments, runbooks, or anything previously saved.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      top_k: Type.Optional(
        Type.Number({ description: "Number of results (default 5)" })
      ),
    }),
    execute: async (_id: string, params: { query: string; top_k?: number }) => {
      const index = loadIndex();
      if (index.chunks.length === 0) {
        return { content: [{ type: "text", text: "Knowledge base is empty. Use save_to_memory to add content." }] };
      }

      let queryEmbed: number[];
      try {
        queryEmbed = await getEmbedding(params.query);
      } catch (e) {
        return { content: [{ type: "text", text: `Search failed: ${e}` }] };
      }

      const k = params.top_k ?? TOP_K;

      const scored = index.chunks.map((chunk, i) => ({
        chunk,
        source: index.sources[i],
        score: cosineSimilarity(queryEmbed, index.embeddings[i]),
      }));

      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, k);

      const text = results
        .map((r, i) => `[${i + 1}] (score: ${r.score.toFixed(4)}, source: ${r.source})\n${r.chunk}`)
        .join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  });

  // Tool 2: Save content to the knowledge base
  pi.registerTool({
    name: "save_to_memory",
    description:
      "Save text content to the persistent knowledge base. " +
      "Use this to store documentation, configurations, runbooks, " +
      "conversation context, or any information for future recall.",
    parameters: Type.Object({
      content: Type.String({ description: "The text content to save" }),
      source: Type.Optional(
        Type.String({ description: "Label for the source (e.g. 'proxmox-docs', 'client-acme')" })
      ),
    }),
    execute: async (_id: string, params: { content: string; source?: string }) => {
      const index = loadIndex();
      const source = params.source ?? "manual";
      const allChunks = chunkText(params.content);

      // Deduplicate: skip chunks whose hash already exists in the index
      const existingHashes = new Set(index.hashes);
      const newChunks = allChunks.filter(chunk => !existingHashes.has(hashChunk(chunk)));
      const skipped = allChunks.length - newChunks.length;

      if (newChunks.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No new content to save — all ${allChunks.length} chunks already exist in the knowledge base (source: "${source}").`,
          }],
        };
      }

      let embeddings: number[][];
      try {
        embeddings = await getEmbeddings(newChunks);
      } catch (e) {
        return { content: [{ type: "text", text: `Save failed: ${e}` }] };
      }

      index.chunks.push(...newChunks);
      index.embeddings.push(...embeddings);
      index.sources.push(...newChunks.map(() => source));
      index.hashes.push(...newChunks.map(hashChunk));
      saveIndex(index);

      const msg = skipped > 0
        ? `Saved ${newChunks.length} new chunks from source "${source}" (${skipped} duplicate(s) skipped). Total: ${index.chunks.length} chunks.`
        : `Saved ${newChunks.length} chunks from source "${source}". Total: ${index.chunks.length} chunks.`;

      return { content: [{ type: "text", text: msg }] };
    },
  });

  // Command: /memory-stats
  pi.registerCommand("memory-stats", {
    description: "Show knowledge base statistics",
    handler: async () => {
      const index = loadIndex();
      const sources = [...new Set(index.sources)];
      const msg = [
        `Knowledge base: ${index.chunks.length} chunks`,
        `Sources: ${sources.length > 0 ? sources.join(", ") : "none"}`,
        `Index file: ${INDEX_PATH}`,
      ].join("\n");
      pi.sendMessage({ content: msg, display: true });
    },
  });

  // Command: /memory-clear
  pi.registerCommand("memory-clear", {
    description: "Clear the entire knowledge base",
    handler: async () => {
      saveIndex({ chunks: [], embeddings: [], sources: [], hashes: [] });
      pi.sendMessage({ content: "Knowledge base cleared.", display: true });
    },
  });
}