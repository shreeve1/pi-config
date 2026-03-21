/**
 * Unit tests for context-prune pruning logic.
 * Run with: node --input-type=commonjs agent/extensions/context-prune/prune.test.ts
 * (Uses jiti for TS loading, no test framework needed)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const { createJiti } = require(
	"/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/node_modules/@mariozechner/jiti/lib/jiti.cjs",
);
const j = createJiti(__filename, { interopDefault: true });
const {
	hashArgs,
	buildToolIndex,
	applyDeduplication,
	applyPurgeErrors,
	applySweep,
} = j("./prune.ts");

// ─── Test helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
	if (cond) {
		passed++;
		console.log(`  ✓ ${msg}`);
	} else {
		failed++;
		console.log(`  ✗ ${msg}`);
	}
}

function assertEqual(a: unknown, b: unknown, msg: string) {
	const eq = JSON.stringify(a) === JSON.stringify(b);
	if (eq) {
		passed++;
		console.log(`  ✓ ${msg}`);
	} else {
		failed++;
		console.log(`  ✗ ${msg}`);
		console.log(`    expected: ${JSON.stringify(b)}`);
		console.log(`    got:      ${JSON.stringify(a)}`);
	}
}

// ─── Message builders ───────────────────────────────────────────────────────────

function userMsg(text: string) {
	return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
}

function assistantMsg(...toolCalls: { id: string; name: string; arguments: any }[]) {
	return {
		role: "assistant",
		content: toolCalls.map((tc) => ({
			type: "toolCall",
			id: tc.id,
			name: tc.name,
			arguments: tc.arguments,
		})),
		provider: "test",
		model: "test",
		api: "test",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse",
		timestamp: Date.now(),
	};
}

function toolResult(toolCallId: string, toolName: string, text: string, isError = false) {
	return {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text }],
		isError,
		timestamp: Date.now(),
	};
}

function toolResultWithImage(toolCallId: string, toolName: string, text: string) {
	return {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [
			{ type: "text", text },
			{ type: "image", source: { type: "base64", mediaType: "image/png", data: "fakedata" } },
		],
		isError: false,
		timestamp: Date.now(),
	};
}

function compactionSummary() {
	return { role: "compactionSummary", summary: "Previous work...", tokensBefore: 50000, timestamp: Date.now() };
}

const DEFAULT_DEDUP_CONFIG = { enabled: true, protectedTools: ["edit", "write"] };
const DEFAULT_PURGE_CONFIG = { enabled: true, turns: 4, minInputLength: 200, protectedTools: [] };

// ─── T.1 Args Hashing ──────────────────────────────────────────────────────────

console.log("\nT.1 Args Hashing");

assert(
	hashArgs({ a: 1, b: 2 }) === hashArgs({ b: 2, a: 1 }),
	"[T.1.1] Order-independent: {a:1,b:2} === {b:2,a:1}",
);

assert(
	hashArgs({ a: 1 }) !== hashArgs({ a: 2 }),
	"[T.1.2] Different values produce different hashes",
);

assert(
	hashArgs({}) === hashArgs({}),
	"[T.1.3] Empty objects are stable",
);

assert(
	hashArgs({ x: { b: 2, a: 1 }, y: [3, 4] }) === hashArgs({ y: [3, 4], x: { a: 1, b: 2 } }),
	"[T.1.4] Nested objects and arrays hash deterministically",
);

assert(
	hashArgs({ a: 1, b: null, c: undefined }) === hashArgs({ a: 1 }),
	"[T.1.5] Null/undefined values are stripped",
);

// ─── T.2 Deduplication ─────────────────────────────────────────────────────────

console.log("\nT.2 Deduplication");

{
	// T.2.1 — Two identical reads, older pruned
	const msgs = [
		userMsg("read foo"),
		assistantMsg({ id: "c1", name: "read", arguments: { path: "foo.ts" } }),
		toolResult("c1", "read", "file content A"),
		userMsg("read foo again"),
		assistantMsg({ id: "c2", name: "read", arguments: { path: "foo.ts" } }),
		toolResult("c2", "read", "file content B"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 1, "[T.2.1] One older duplicate pruned");
	assert(
		msgs[2].content[0].text.includes("Pruned by context-prune"),
		"[T.2.1] Older result replaced with placeholder",
	);
	assert(msgs[5].content[0].text === "file content B", "[T.2.1] Newer result intact");
}

{
	// T.2.2 — Different args, both kept
	const msgs = [
		userMsg("read foo"),
		assistantMsg({ id: "c1", name: "read", arguments: { path: "foo.ts" } }),
		toolResult("c1", "read", "content foo"),
		userMsg("read bar"),
		assistantMsg({ id: "c2", name: "read", arguments: { path: "bar.ts" } }),
		toolResult("c2", "read", "content bar"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 0, "[T.2.2] Different args → no pruning");
}

{
	// T.2.3 — Three identical, middle errored
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "read", arguments: { path: "f.ts" } }),
		toolResult("c1", "read", "content v1"),
		userMsg("again"),
		assistantMsg({ id: "c2", name: "read", arguments: { path: "f.ts" } }),
		toolResult("c2", "read", "Error: not found", true),
		userMsg("once more"),
		assistantMsg({ id: "c3", name: "read", arguments: { path: "f.ts" } }),
		toolResult("c3", "read", "content v3"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 1, "[T.2.3] Only oldest successful pruned");
	assert(msgs[2].content[0].text.includes("Pruned"), "[T.2.3] First success replaced");
	assert(msgs[5].content[0].text === "Error: not found", "[T.2.3] Error untouched");
	assert(msgs[8].content[0].text === "content v3", "[T.2.3] Latest success intact");
}

{
	// T.2.4 — Protected tool (edit) never pruned
	const msgs = [
		userMsg("edit"),
		assistantMsg({ id: "c1", name: "edit", arguments: { path: "f.ts", oldText: "a", newText: "b" } }),
		toolResult("c1", "edit", "edited"),
		userMsg("edit again"),
		assistantMsg({ id: "c2", name: "edit", arguments: { path: "f.ts", oldText: "a", newText: "b" } }),
		toolResult("c2", "edit", "edited"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 0, "[T.2.4] Protected tool (edit) → no pruning");
}

{
	// T.2.5 — Only errors in group, all kept
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "bash", arguments: { command: "fail" } }),
		toolResult("c1", "bash", "error 1", true),
		userMsg("retry"),
		assistantMsg({ id: "c2", name: "bash", arguments: { command: "fail" } }),
		toolResult("c2", "bash", "error 2", true),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 0, "[T.2.5] All errors → no pruning");
}

{
	// T.2.6 — Image content replaced entirely
	const msgs = [
		userMsg("read image"),
		assistantMsg({ id: "c1", name: "read", arguments: { path: "pic.png" } }),
		toolResultWithImage("c1", "read", "image data v1"),
		userMsg("read again"),
		assistantMsg({ id: "c2", name: "read", arguments: { path: "pic.png" } }),
		toolResultWithImage("c2", "read", "image data v2"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 1, "[T.2.6] Image duplicate pruned");
	assertEqual(msgs[2].content.length, 1, "[T.2.6] Entire content array replaced (was 2 parts, now 1)");
	assert(msgs[2].content[0].type === "text", "[T.2.6] Replaced with text placeholder");
	assertEqual(msgs[5].content.length, 2, "[T.2.6] Newer image result intact");
}

{
	// T.2.7 — Parallel tool calls in same assistant message
	const msgs = [
		userMsg("read both"),
		assistantMsg(
			{ id: "c1", name: "read", arguments: { path: "foo.ts" } },
			{ id: "c2", name: "read", arguments: { path: "foo.ts" } },
		),
		toolResult("c1", "read", "content v1"),
		toolResult("c2", "read", "content v2"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 1, "[T.2.7] Parallel duplicate → older pruned");
	assert(msgs[2].content[0].text.includes("Pruned"), "[T.2.7] First result replaced");
	assert(msgs[3].content[0].text === "content v2", "[T.2.7] Second result intact");
}

{
	// T.2.8 — Orphaned tool result (no matching ToolCall)
	const msgs = [
		compactionSummary(),
		// This tool result has no matching assistant message (it was compacted)
		toolResult("orphan-1", "read", "orphaned output"),
		userMsg("new work"),
		assistantMsg({ id: "c1", name: "read", arguments: { path: "foo.ts" } }),
		toolResult("c1", "read", "current output"),
	];
	const idx = buildToolIndex(msgs);
	assert(idx.orphanedResults.length === 1, "[T.2.8] One orphaned result detected");
	const stats = applyDeduplication(idx.toolCallMap, idx.toolResults, DEFAULT_DEDUP_CONFIG);
	assert(stats.prunedCount === 0, "[T.2.8] Orphan skipped, no pruning");
	assert(msgs[1].content[0].text === "orphaned output", "[T.2.8] Orphan content untouched");
}

// ─── T.3 Purge Errors ──────────────────────────────────────────────────────────

console.log("\nT.3 Purge Errors");

{
	// T.3.1 — Error 3 turns ago, threshold 4 → NOT scrubbed
	const longInput = "x".repeat(300);
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "bash", arguments: { command: longInput } }),
		toolResult("c1", "bash", "command failed", true),
		userMsg("turn 1"),
		userMsg("turn 2"),
		userMsg("turn 3"),
	];
	const idx = buildToolIndex(msgs);
	applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, DEFAULT_PURGE_CONFIG);
	assert(
		(msgs[1] as any).content[0].arguments.command === longInput,
		"[T.3.1] Error only 3 turns ago → args NOT scrubbed",
	);
}

{
	// T.3.2 — Error 5 turns ago, threshold 4 → scrubbed with note
	const longInput = "x".repeat(300);
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "bash", arguments: { command: longInput } }),
		toolResult("c1", "bash", "command failed", true),
		userMsg("turn 1"),
		userMsg("turn 2"),
		userMsg("turn 3"),
		userMsg("turn 4"),
		userMsg("turn 5"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, DEFAULT_PURGE_CONFIG);
	assert(stats.prunedCount === 1, "[T.3.2] One error scrubbed");
	const args = (msgs[1] as any).content[0].arguments;
	assert(
		typeof args.command === "string" && args.command.includes("pruned by context-prune"),
		"[T.3.2] Large arg replaced with placeholder",
	);
	assert(
		msgs[2].content[0].text.includes("Note: input args"),
		"[T.3.2] Explanatory note prepended to tool result",
	);
	assert(
		msgs[2].content[1].text === "command failed",
		"[T.3.2] Original error message preserved after note",
	);
}

{
	// T.3.3 — Short input below minInputLength
	const shortInput = "x".repeat(100);
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "bash", arguments: { command: shortInput } }),
		toolResult("c1", "bash", "failed", true),
		userMsg("t1"), userMsg("t2"), userMsg("t3"), userMsg("t4"), userMsg("t5"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, DEFAULT_PURGE_CONFIG);
	assert(stats.prunedCount === 0, "[T.3.3] Short input → not scrubbed");
}

{
	// T.3.4 — Protected tool
	const longInput = "x".repeat(300);
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "special", arguments: { data: longInput } }),
		toolResult("c1", "special", "failed", true),
		userMsg("t1"), userMsg("t2"), userMsg("t3"), userMsg("t4"), userMsg("t5"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, {
		...DEFAULT_PURGE_CONFIG,
		protectedTools: ["special"],
	});
	assert(stats.prunedCount === 0, "[T.3.4] Protected tool → not scrubbed");
}

{
	// T.3.5 — Error result content preserved after note
	const longInput = "x".repeat(300);
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "bash", arguments: { command: longInput } }),
		toolResult("c1", "bash", "Error: permission denied", true),
		userMsg("t1"), userMsg("t2"), userMsg("t3"), userMsg("t4"), userMsg("t5"),
	];
	const idx = buildToolIndex(msgs);
	applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, DEFAULT_PURGE_CONFIG);
	const resultContent = msgs[2].content;
	assert(resultContent.length === 2, "[T.3.5] Note prepended (2 parts total)");
	assert(
		resultContent[1].text === "Error: permission denied",
		"[T.3.5] Original error text preserved",
	);
}

{
	// T.3.6 — Non-string args left alone
	const msgs = [
		userMsg("try"),
		assistantMsg({ id: "c1", name: "bash", arguments: { timeout: 5000, verbose: true, count: 42 } }),
		toolResult("c1", "bash", "failed", true),
		userMsg("t1"), userMsg("t2"), userMsg("t3"), userMsg("t4"), userMsg("t5"),
	];
	const idx = buildToolIndex(msgs);
	const stats = applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, DEFAULT_PURGE_CONFIG);
	assert(stats.prunedCount === 0, "[T.3.6] Non-string args → nothing to scrub");
	const args = (msgs[1] as any).content[0].arguments;
	assertEqual(args.timeout, 5000, "[T.3.6] Number arg preserved");
	assertEqual(args.verbose, true, "[T.3.6] Boolean arg preserved");
}

{
	// T.3.7 — Orphaned errored result skipped
	const msgs = [
		compactionSummary(),
		toolResult("orphan-err", "bash", "Error: command failed", true),
		userMsg("t1"), userMsg("t2"), userMsg("t3"), userMsg("t4"), userMsg("t5"),
	];
	const idx = buildToolIndex(msgs);
	assert(idx.orphanedResults.length === 1, "[T.3.7] Orphaned error detected");
	const stats = applyPurgeErrors(msgs, idx.toolCallMap, idx.toolResults, DEFAULT_PURGE_CONFIG);
	assert(stats.prunedCount === 0, "[T.3.7] Orphaned error → skipped");
}

// ─── T.sweep ────────────────────────────────────────────────────────────────────

console.log("\nT.sweep");

{
	const msgs = [
		userMsg("start"),
		assistantMsg({ id: "c1", name: "read", arguments: { path: "a.ts" } }),
		toolResult("c1", "read", "content A"),
		assistantMsg({ id: "c2", name: "read", arguments: { path: "b.ts" } }),
		toolResult("c2", "read", "content B"),
	];
	const idx = buildToolIndex(msgs);
	const sweepSet = new Set(["c1"]);
	const count = applySweep(idx.toolResults, sweepSet);
	assert(count === 1, "[T.sweep.1] One result swept");
	assert(msgs[2].content[0].text.includes("Manually pruned"), "[T.sweep.1] Swept content replaced");
	assert(msgs[4].content[0].text === "content B", "[T.sweep.1] Other result untouched");
}

// ─── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
