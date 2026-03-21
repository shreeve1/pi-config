/**
 * context-prune extension for Pi
 *
 * Automatically reduces effective LLM context by:
 * - Deduplicating repeated tool outputs (keeps only the most recent)
 * - Scrubbing inputs from stale errored tool calls
 *
 * Both strategies run transparently on every LLM call via the `context` event.
 * Session history is never mutated.
 *
 * Commands:
 *   /prune           — show pruning stats and config
 *   /prune on|off    — enable/disable at runtime
 *   /prune config    — show current config
 *   /prune sweep [n] — manually prune recent tool results
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	buildToolIndex,
	applyDeduplication,
	applyPurgeErrors,
	applySweep,
	type PrunePassStats,
} from "./prune.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Config ─────────────────────────────────────────────────────────────────────

interface ContextPruneConfig {
	enabled: boolean;
	debug: boolean;
	deduplication: {
		enabled: boolean;
		protectedTools: string[];
	};
	purgeErrors: {
		enabled: boolean;
		turns: number;
		minInputLength: number;
		protectedTools: string[];
	};
}

const DEFAULT_CONFIG: ContextPruneConfig = {
	enabled: true,
	debug: false,
	deduplication: {
		enabled: true,
		protectedTools: ["edit", "write"],
	},
	purgeErrors: {
		enabled: true,
		turns: 4,
		minInputLength: 200,
		protectedTools: [],
	},
};

function stripJsoncComments(text: string): string {
	// Strip // line comments and /* block comments */ outside of strings
	let result = "";
	let inString = false;
	let escape = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			result += ch;
			if (escape) {
				escape = false;
			} else if (ch === "\\") {
				escape = true;
			} else if (ch === '"') {
				inString = false;
			}
		} else {
			if (ch === '"') {
				inString = true;
				result += ch;
			} else if (ch === "/" && text[i + 1] === "/") {
				// Skip to end of line
				while (i < text.length && text[i] !== "\n") i++;
				result += "\n";
			} else if (ch === "/" && text[i + 1] === "*") {
				// Skip to closing */
				i += 2;
				while (i < text.length - 1 && !(text[i] === "*" && text[i + 1] === "/")) i++;
				i++; // skip the /
			} else {
				result += ch;
			}
		}
	}
	return result;
}

function loadJsoncFile(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, "utf-8");
		return JSON.parse(stripJsoncComments(raw));
	} catch {
		return null;
	}
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = { ...base };
	for (const [key, val] of Object.entries(override)) {
		if (val !== null && typeof val === "object" && !Array.isArray(val)
			&& typeof base[key] === "object" && base[key] !== null && !Array.isArray(base[key])) {
			out[key] = deepMerge(base[key] as Record<string, unknown>, val as Record<string, unknown>);
		} else {
			out[key] = val;
		}
	}
	return out;
}

function loadConfig(cwd: string): ContextPruneConfig {
	let merged: Record<string, unknown> = DEFAULT_CONFIG as unknown as Record<string, unknown>;

	// Global config
	const globalPath = join(homedir(), ".pi", "agent", "context-prune.jsonc");
	const global = loadJsoncFile(globalPath);
	if (global) {
		merged = deepMerge(merged, global);
	}

	// Project-local config
	const projectPath = join(cwd, ".pi", "context-prune.jsonc");
	const project = loadJsoncFile(projectPath);
	if (project) {
		merged = deepMerge(merged, project);
	}

	return merged as unknown as ContextPruneConfig;
}

// ─── Module state ───────────────────────────────────────────────────────────────

let config: ContextPruneConfig = { ...DEFAULT_CONFIG };
let lastStats: PrunePassStats | null = null;
const sweepSet = new Set<string>();

// ─── Extension entry point ──────────────────────────────────────────────────────

export default function contextPruneExtension(pi: ExtensionAPI) {
	// ─── Session lifecycle ─────────────────────────────────────────────────────

	pi.on("session_start", (_event, ctx) => {
		config = loadConfig(ctx.cwd);
		sweepSet.clear();
		lastStats = null;
		updateStatus(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		config = loadConfig(ctx.cwd);
		sweepSet.clear();
		lastStats = null;
		updateStatus(ctx);
	});

	// ─── Core: context pruning (runs automatically every LLM call) ─────────────

	pi.on("context", (event) => {
		if (!config.enabled) return;

		const messages = event.messages;
		const index = buildToolIndex(messages as unknown as Record<string, unknown>[]);

		// Apply sweep (manual prune) first
		const sweepCount = applySweep(index.toolResults, sweepSet);

		// Apply automatic strategies
		const dedupStats = applyDeduplication(
			index.toolCallMap,
			index.toolResults,
			config.deduplication,
		);

		const purgeStats = applyPurgeErrors(
			messages as unknown as Record<string, unknown>[],
			index.toolCallMap,
			index.toolResults,
			config.purgeErrors,
		);

		lastStats = {
			dedup: dedupStats,
			purgeErrors: purgeStats,
			orphanedCount: index.orphanedResults.length,
			sweepCount,
		};

		if (config.debug) {
			const total = dedupStats.prunedCount + purgeStats.prunedCount + sweepCount;
			if (total > 0 || index.orphanedResults.length > 0) {
				process.stderr.write(
					`[context-prune] dedup=${dedupStats.prunedCount} purge=${purgeStats.prunedCount} sweep=${sweepCount} orphans=${index.orphanedResults.length} chars_saved=${dedupStats.prunedChars + purgeStats.prunedChars}\n`,
				);
			}
		}

		const totalPruned = dedupStats.prunedCount + purgeStats.prunedCount + sweepCount;
		if (totalPruned > 0) {
			return { messages };
		}
		// If nothing changed, return nothing to avoid unnecessary work
	});

	// ─── Footer status ─────────────────────────────────────────────────────────

	function updateStatus(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		if (!config.enabled) {
			ctx.ui.setStatus("context-prune", "");
			return;
		}
		if (lastStats) {
			const total = lastStats.dedup.prunedCount + lastStats.purgeErrors.prunedCount + lastStats.sweepCount;
			if (total > 0) {
				ctx.ui.setStatus("context-prune", `✂ ${total} pruned`);
				return;
			}
		}
		ctx.ui.setStatus("context-prune", "✂ prune");
	}

	// Update status after each turn (context handler can't access ctx)
	pi.on("turn_end", (_event, ctx) => {
		updateStatus(ctx);
	});

	// ─── /prune command ────────────────────────────────────────────────────────

	pi.registerCommand("prune", {
		description: "Context pruning stats and control. Usage: /prune [on|off|config|sweep [n]]",
		async handler(args, ctx) {
			const arg = (args ?? "").trim().toLowerCase();
			const parts = arg.split(/\s+/).filter(Boolean);
			const subcommand = parts[0] ?? "";

			// /prune on | off
			if (subcommand === "on") {
				config.enabled = true;
				updateStatus(ctx);
				ctx.ui.notify("Context pruning ON", "info");
				return;
			}
			if (subcommand === "off") {
				config.enabled = false;
				updateStatus(ctx);
				ctx.ui.notify("Context pruning OFF", "info");
				return;
			}

			// /prune config
			if (subcommand === "config") {
				const lines = [
					"Context Prune Config",
					"─────────────────────────",
					`Enabled:     ${config.enabled}`,
					`Debug:       ${config.debug}`,
					"",
					"Deduplication:",
					`  Enabled:   ${config.deduplication.enabled}`,
					`  Protected: ${config.deduplication.protectedTools.join(", ") || "(none)"}`,
					"",
					"Purge Errors:",
					`  Enabled:   ${config.purgeErrors.enabled}`,
					`  Turns:     ${config.purgeErrors.turns}`,
					`  Min input: ${config.purgeErrors.minInputLength} chars`,
					`  Protected: ${config.purgeErrors.protectedTools.join(", ") || "(none)"}`,
				];
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			// /prune sweep [n]
			if (subcommand === "sweep") {
				const n = parts[1] ? parseInt(parts[1], 10) : undefined;
				const swept = performSweep(ctx, n);
				if (swept === 0) {
					ctx.ui.notify("No tool results found to sweep.", "info");
				} else {
					ctx.ui.notify(`Marked ${swept} tool result(s) for pruning. Takes effect on next LLM call.`, "info");
				}
				return;
			}

			// /prune (no args) — show status
			const lines = [
				`Context Prune: ${config.enabled ? "ON" : "OFF"}`,
				`  Dedup:  ${config.deduplication.enabled ? "on" : "off"} (protected: ${config.deduplication.protectedTools.join(", ") || "none"})`,
				`  Purge:  ${config.purgeErrors.enabled ? "on" : "off"} (after ${config.purgeErrors.turns} turns)`,
			];

			if (lastStats) {
				const totalChars = lastStats.dedup.prunedChars + lastStats.purgeErrors.prunedChars;
				lines.push("");
				lines.push("Last turn:");
				lines.push(`  Dedup:    ${lastStats.dedup.prunedCount} results pruned (${fmtChars(lastStats.dedup.prunedChars)})`);
				lines.push(`  Purge:    ${lastStats.purgeErrors.prunedCount} error inputs scrubbed (${fmtChars(lastStats.purgeErrors.prunedChars)})`);
				if (lastStats.sweepCount > 0) {
					lines.push(`  Sweep:    ${lastStats.sweepCount} manually pruned`);
				}
				lines.push(`  Orphans:  ${lastStats.orphanedCount} (post-compaction, skipped)`);
				lines.push(`  Total:    ~${fmtChars(totalChars)} saved`);
			} else {
				lines.push("");
				lines.push("No pruning stats yet (waiting for first LLM call).");
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ─── Sweep implementation ──────────────────────────────────────────────────

	function performSweep(ctx: ExtensionContext, maxCount?: number): number {
		const branch = ctx.sessionManager.getBranch();
		const toolCallIds: string[] = [];

		// Walk backward from leaf, collect tool result IDs until we hit a user message
		// or reach maxCount
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i] as unknown as Record<string, unknown>;
			if (entry.type !== "message") continue;

			const msg = entry.message as Record<string, unknown> | undefined;
			if (!msg) continue;

			if (msg.role === "user") break; // stop at last user message
			if (msg.role === "toolResult") {
				const toolCallId = msg.toolCallId as string | undefined;
				if (toolCallId) {
					toolCallIds.push(toolCallId);
					if (maxCount !== undefined && toolCallIds.length >= maxCount) break;
				}
			}
		}

		for (const id of toolCallIds) {
			sweepSet.add(id);
		}

		return toolCallIds.length;
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtChars(n: number): string {
	if (n < 1000) return `${n} chars`;
	if (n < 100_000) return `${(n / 1000).toFixed(1)}K chars`;
	return `${Math.round(n / 1000)}K chars`;
}
