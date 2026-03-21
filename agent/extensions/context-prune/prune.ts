/**
 * context-prune/prune.ts
 *
 * Pure functions for context pruning strategies: deduplication and purge-errors.
 * No Pi runtime dependency — operates on AgentMessage arrays via duck typing.
 *
 * Works with the following AgentMessage shapes from pi-ai:
 *   AssistantMessage.content: (TextContent | ThinkingContent | ToolCall)[]
 *     ToolCall: { type: "toolCall", id: string, name: string, arguments: Record<string, any> }
 *   ToolResultMessage: { role: "toolResult", toolCallId: string, toolName: string,
 *     content: (TextContent | ImageContent)[], isError: boolean }
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Extracted tool call info keyed by toolCallId */
export interface ToolCallEntry {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	/** Reference to the AssistantMessage containing this tool call */
	message: Record<string, unknown>;
	/** Index of the ToolCall within AssistantMessage.content */
	contentIndex: number;
}

/** Shape of ToolResultMessage from pi-ai (duck typed) */
export interface ToolResultLike {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: { type: string; text?: string; [key: string]: unknown }[];
	isError: boolean;
	timestamp: number;
	details?: unknown;
}

/** A tool result with its position in the message array */
export interface IndexedToolResult {
	result: ToolResultLike;
	messageIndex: number;
}

/** Output of buildToolIndex */
export interface ToolIndex {
	toolCallMap: Map<string, ToolCallEntry>;
	toolResults: IndexedToolResult[];
	orphanedResults: IndexedToolResult[];
}

/** Stats returned by each pruning strategy */
export interface PruneStats {
	prunedCount: number;
	prunedChars: number;
}

/** Combined stats for a full pruning pass */
export interface PrunePassStats {
	dedup: PruneStats;
	purgeErrors: PruneStats;
	orphanedCount: number;
	sweepCount: number;
}

/** Config subset needed by pruning functions */
export interface DeduplicationConfig {
	enabled: boolean;
	protectedTools: string[];
}

export interface PurgeErrorsConfig {
	enabled: boolean;
	turns: number;
	minInputLength: number;
	protectedTools: string[];
}

// ─── Args Hashing ───────────────────────────────────────────────────────────────

/**
 * Produce a deterministic string key from tool call arguments.
 * Order-independent: { a: 1, b: 2 } and { b: 2, a: 1 } produce the same hash.
 */
export function hashArgs(args: Record<string, unknown>): string {
	return JSON.stringify(sortDeep(stripNulls(args)));
}

function stripNulls(obj: unknown): unknown {
	if (obj === null || obj === undefined) return undefined;
	if (Array.isArray(obj)) return obj.map(stripNulls);
	if (typeof obj === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			const stripped = stripNulls(v);
			if (stripped !== undefined) {
				out[k] = stripped;
			}
		}
		return out;
	}
	return obj;
}

function sortDeep(obj: unknown): unknown {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map(sortDeep);
	if (typeof obj === "object") {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
			sorted[key] = sortDeep((obj as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return obj;
}

// ─── Tool Index ─────────────────────────────────────────────────────────────────

/**
 * Walk an AgentMessage array and build indexes of tool calls and results.
 *
 * Tool calls are extracted from AssistantMessage.content (ToolCall entries).
 * Tool results are ToolResultMessage entries.
 * Orphaned results are ToolResultMessages whose toolCallId has no matching ToolCall
 * (typically because compaction removed the parent AssistantMessage).
 */
export function buildToolIndex(messages: readonly Record<string, unknown>[]): ToolIndex {
	const toolCallMap = new Map<string, ToolCallEntry>();
	const toolResults: IndexedToolResult[] = [];
	const orphanedResults: IndexedToolResult[] = [];

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i] as Record<string, unknown>;

		if (msg.role === "assistant") {
			const content = msg.content;
			if (Array.isArray(content)) {
				for (let ci = 0; ci < content.length; ci++) {
					const part = content[ci];
					if (part && typeof part === "object" && part.type === "toolCall") {
						toolCallMap.set(part.id as string, {
							toolCallId: part.id as string,
							toolName: part.name as string,
							args: (part.arguments as Record<string, unknown>) ?? {},
							message: msg,
							contentIndex: ci,
						});
					}
				}
			}
		} else if (msg.role === "toolResult") {
			toolResults.push({
				result: msg as unknown as ToolResultLike,
				messageIndex: i,
			});
		}
	}

	// Separate orphaned results
	const matched: IndexedToolResult[] = [];
	for (const tr of toolResults) {
		if (toolCallMap.has(tr.result.toolCallId)) {
			matched.push(tr);
		} else {
			orphanedResults.push(tr);
		}
	}

	return { toolCallMap, toolResults: matched, orphanedResults };
}

// ─── Deduplication ──────────────────────────────────────────────────────────────

const DEDUP_PLACEHOLDER = "[Pruned by context-prune: superseded by a newer identical call]";

/**
 * For each (toolName, argsHash) group, keep only the most recent successful result.
 * Replace older successful results' entire content array with a placeholder.
 * Skips protected tools and orphaned results.
 * Mutates messages in place.
 */
export function applyDeduplication(
	toolCallMap: Map<string, ToolCallEntry>,
	toolResults: IndexedToolResult[],
	config: DeduplicationConfig,
): PruneStats {
	if (!config.enabled) return { prunedCount: 0, prunedChars: 0 };

	const protectedSet = new Set(config.protectedTools);

	// Group by (toolName, argsHash)
	const groups = new Map<string, IndexedToolResult[]>();

	for (const tr of toolResults) {
		const entry = toolCallMap.get(tr.result.toolCallId);
		if (!entry) continue; // orphan — shouldn't be here but guard anyway
		if (protectedSet.has(entry.toolName)) continue;

		const key = `${entry.toolName}::${hashArgs(entry.args)}`;
		let group = groups.get(key);
		if (!group) {
			group = [];
			groups.set(key, group);
		}
		group.push(tr);
	}

	let prunedCount = 0;
	let prunedChars = 0;

	for (const [, group] of groups) {
		if (group.length < 2) continue;

		// Find the last successful result (highest messageIndex with isError === false)
		let latestSuccessIdx = -1;
		for (let i = group.length - 1; i >= 0; i--) {
			if (!group[i].result.isError) {
				latestSuccessIdx = i;
				break;
			}
		}

		if (latestSuccessIdx === -1) continue; // all errors — keep everything

		// Replace older successful results
		for (let i = 0; i < group.length; i++) {
			if (i === latestSuccessIdx) continue;
			if (group[i].result.isError) continue; // don't touch errors

			const result = group[i].result;
			const oldChars = contentCharCount(result.content);
			result.content = [{ type: "text", text: DEDUP_PLACEHOLDER }];
			prunedChars += Math.max(0, oldChars - DEDUP_PLACEHOLDER.length);
			prunedCount++;
		}
	}

	return { prunedCount, prunedChars };
}

// ─── Purge Errors ───────────────────────────────────────────────────────────────

const PURGE_NOTE_PREFIX = "[Note: input args for this failed call were pruned from context to save tokens.]\n";

/**
 * For errored tool calls older than `turns` user messages, scrub large string
 * arguments and prepend an explanatory note to the tool result content.
 * Skips protected tools and orphaned results.
 * Mutates messages in place.
 */
export function applyPurgeErrors(
	messages: readonly Record<string, unknown>[],
	toolCallMap: Map<string, ToolCallEntry>,
	toolResults: IndexedToolResult[],
	config: PurgeErrorsConfig,
): PruneStats {
	if (!config.enabled) return { prunedCount: 0, prunedChars: 0 };

	const protectedSet = new Set(config.protectedTools);

	// Build a map: messageIndex → number of user messages that appear after it
	const userTurnsAfter = buildUserTurnsAfterMap(messages);

	let prunedCount = 0;
	let prunedChars = 0;

	for (const tr of toolResults) {
		if (!tr.result.isError) continue;

		const entry = toolCallMap.get(tr.result.toolCallId);
		if (!entry) continue; // orphan guard
		if (protectedSet.has(entry.toolName)) continue;

		const turnsAgo = userTurnsAfter.get(tr.messageIndex) ?? 0;
		if (turnsAgo < config.turns) continue;

		// Scrub large string args in the ToolCall
		let scrubbed = false;
		const args = entry.args as Record<string, unknown>;
		for (const key of Object.keys(args)) {
			if (typeof args[key] === "string" && (args[key] as string).length >= config.minInputLength) {
				prunedChars += (args[key] as string).length;
				args[key] = `[Input pruned by context-prune: errored tool call, ${turnsAgo} turns ago]`;
				prunedChars -= (args[key] as string).length;
				scrubbed = true;
			}
		}

		if (scrubbed) {
			// Prepend explanatory note to tool result content
			const content = tr.result.content;
			if (Array.isArray(content)) {
				const alreadyNoted = content.length > 0
					&& content[0].type === "text"
					&& typeof content[0].text === "string"
					&& content[0].text.startsWith("[Note: input args");
				if (!alreadyNoted) {
					content.unshift({ type: "text", text: PURGE_NOTE_PREFIX });
				}
			}
			prunedCount++;
		}
	}

	return { prunedCount, prunedChars };
}

/**
 * For each message index, count how many user messages appear after it in the array.
 */
function buildUserTurnsAfterMap(messages: readonly Record<string, unknown>[]): Map<number, number> {
	const map = new Map<number, number>();

	// Walk backward, counting user messages
	let userCount = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		map.set(i, userCount);
		if ((messages[i] as Record<string, unknown>).role === "user") {
			userCount++;
		}
	}

	return map;
}

// ─── Sweep (manual prune) ───────────────────────────────────────────────────────

const SWEEP_PLACEHOLDER = "[Manually pruned by /prune sweep]";

/**
 * Replace content for tool results whose toolCallId is in the sweep set.
 * Mutates messages in place. Returns count of swept results.
 */
export function applySweep(
	toolResults: IndexedToolResult[],
	sweepSet: Set<string>,
): number {
	if (sweepSet.size === 0) return 0;

	let count = 0;
	for (const tr of toolResults) {
		if (sweepSet.has(tr.result.toolCallId)) {
			tr.result.content = [{ type: "text", text: SWEEP_PLACEHOLDER }];
			sweepSet.delete(tr.result.toolCallId);
			count++;
		}
	}
	return count;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function contentCharCount(content: unknown[]): number {
	let total = 0;
	for (const part of content) {
		if (part && typeof part === "object" && (part as Record<string, unknown>).type === "text") {
			total += ((part as Record<string, unknown>).text as string)?.length ?? 0;
		}
		// ImageContent doesn't have a simple char count; estimate as 0
		// (the dedup still saves by removing the image data)
	}
	return total;
}
