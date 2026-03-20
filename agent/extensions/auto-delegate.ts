/**
 * Auto-Delegate Extension for Pi
 *
 * Automatically injects routing instructions into the system prompt and
 * prepends per-prompt hints when high-confidence delegation signals are detected.
 *
 * Layer 1 — Static system prompt injection (before_agent_start):
 *   Appends a routing guide listing agent categories and trigger words.
 *
 * Layer 2 — Dynamic routing hints (input event):
 *   Pattern-matches the user's prompt and prepends a short hint when a
 *   high-confidence intent signal is found.
 *
 * Commands:
 *   /delegate        — Toggle hints on/off (shows current status)
 *   /delegate on     — Enable hints
 *   /delegate off    — Disable hints
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// --- State ---
let hintsEnabled = true;

// --- Routing Guide (injected into system prompt on every turn) ---
const ROUTING_GUIDE = `
## Subagent Routing Guide

You have two delegation tools. Choose the right one based on the task shape.

---

### \`subagent\` — Named specialist agents (synchronous, integrated output)

Use when the task maps cleanly to a specialist role. Results are returned inline.

**Research / Web:**
- Signals: "search the web", "look up online", "find online", "latest release", "docs for", "news about", "verify info"
- Delegate to: \`web-searcher\`
- Example: subagent({ agent: "web-searcher", task: "..." })

**Codebase Exploration:**
- Signals: "explore", "scout", "what files", "find where", "how is X structured", "where is X defined"
- Delegate to: \`scout\`
- Example: subagent({ agent: "scout", task: "..." })

**Code Review / Audit:**
- Signals: "review this code", "audit", "check for issues", "security audit", "code quality"
- Delegate to: \`reviewer\`
- Example: subagent({ agent: "reviewer", task: "..." })

**Implementation / Refactor (isolated subtask):**
- Signals: "implement this feature", "build this component", "refactor", "rewrite this module"
- Delegate to: \`worker\`
- Example: subagent({ agent: "worker", task: "..." })

**Planning (complex multi-step tasks):**
- Signals: "make a plan", "plan this out", "design a solution", "what's the approach for"
- Use \`planner\` — ideally after \`scout\` gathers context first
- Example: subagent({ chain: [{ agent: "scout", task: "find relevant files for X" }, { agent: "planner", task: "create plan for X based on: {previous}" }] })

**Parallel tasks:**
- When multiple independent research angles or subtasks exist, use parallel mode:
  subagent({ tasks: [{ agent: "...", task: "..." }, ...] })

**Chain tasks:**
- When output from one agent feeds into another, use chain mode:
  subagent({ chain: [{ agent: "scout", task: "find X" }, { agent: "worker", task: "implement X using: {previous}" }] })

---

### \`subagent_create\` / \`subagent_continue\` — Background subagents with persistent sessions

Use when the task is long-running, benefits from isolation, or may need follow-up turns.

- **subagent_create({ task })** — Spawns a background agent immediately and returns its ID. Results arrive as a follow-up message when done. A live widget shows real-time progress.
- **subagent_continue({ id, prompt })** — Resumes a finished subagent's conversation, retaining full history. Use this to drill deeper, request revisions, or build on prior output.
- **subagent_list()** — List all active/finished background subagents.
- **subagent_remove({ id })** — Kill and clean up a specific subagent.

**When to prefer subagent_create over subagent:**
- Task will take many tool calls or a long time (exploration + implementation together)
- You want to continue the conversation with the agent after seeing its output
- You're running it fire-and-forget while doing other work in parallel
- The task doesn't map to a named specialist agent

---

Use your judgment. You do NOT need to delegate everything — only when delegation clearly improves quality or efficiency.
`.trim();

// --- Routing Patterns (Layer 2: per-prompt hints) ---
interface RoutingPattern {
	patterns: RegExp[];
	hint: string;
}

const ROUTING_PATTERNS: RoutingPattern[] = [
	{
		patterns: [
			/\bweb search\b/i,
			/\bsearch online\b/i,
			/\bsearch the web\b/i,
			/\blook up online\b/i,
			/\bfind online\b/i,
			/\blatest release\b/i,
			/\blatest version\b/i,
			/\bnews about\b/i,
			/\bdocs for\b/i,
			/\bverify.*online\b/i,
			/\bcheck.*documentation\b/i,
			/\bperform web search\b/i,
		],
		hint: "[Route hint: web research — consider delegating to web-searcher subagent]",
	},
	{
		patterns: [
			/\bexplore\b/i,
			/\bscout\b/i,
			/\bwhat files\b/i,
			/\bfind where\b/i,
			/\bhow is.*structured\b/i,
			/\bwhere is.*defined\b/i,
		],
		hint: "[Route hint: codebase recon — consider delegating to scout subagent]",
	},
	{
		patterns: [
			/\bcode review\b/i,
			/\baudit\b/i,
			/\bcheck for issues\b/i,
			/\bsecurity audit\b/i,
			/\bcode quality\b/i,
			/\breview this (code|file|function|class|module)\b/i,
		],
		hint: "[Route hint: review task — consider delegating to reviewer subagent]",
	},
	{
		patterns: [
			/\bimplement.*feature\b/i,
			/\bbuild.*component\b/i,
			/\brefactor\b/i,
			/\brewrite.*module\b/i,
			/\bcreate.*component\b/i,
		],
		hint: "[Route hint: implementation task — consider delegating to worker subagent]",
	},
	{
		patterns: [
			/\bmake a plan\b/i,
			/\bplan this out\b/i,
			/\bdesign a solution\b/i,
			/\bwhat'?s? (the )?(approach|strategy|plan)\b/i,
		],
		hint: "[Route hint: planning task — consider using scout → planner chain]",
	},
	{
		patterns: [
			/\bparallel\b/i,
			/\bat the same time\b/i,
			/\bsimultaneously\b/i,
			/\bmultiple.*research\b/i,
			/\brun.*together\b/i,
		],
		hint: "[Route hint: parallel work — consider using subagent parallel mode with tasks array]",
	},
];

function detectDelegationHint(text: string): string | null {
	for (const entry of ROUTING_PATTERNS) {
		for (const pattern of entry.patterns) {
			if (pattern.test(text)) {
				return entry.hint;
			}
		}
	}
	return null;
}

// --- Extension entry point ---
export default function (pi: ExtensionAPI) {
	// Layer 1: Inject static routing guide into system prompt on every turn
	pi.on("before_agent_start", (event) => {
		event.systemPrompt = event.systemPrompt + "\n\n" + ROUTING_GUIDE;
	});

	// Layer 2: Pattern-match input and prepend a routing hint when confident
	pi.on("input", (event, ctx) => {
		if (!hintsEnabled) return;
		// Only apply hints in interactive (UI) mode
		if (!ctx.hasUI) return;

		const hint = detectDelegationHint(event.text);
		if (hint) {
			return {
				action: "transform",
				text: hint + "\n\n" + event.text,
			};
		}
	});

	// /delegate command — toggle or set hints on/off
	pi.registerCommand("delegate", {
		description: "Toggle auto-delegation routing hints (usage: /delegate [on|off])",
		handler(_args, ctx) {
			const arg = (_args ?? "").trim().toLowerCase();

			if (arg === "on") {
				hintsEnabled = true;
				ctx.ui.notify("Auto-delegate hints enabled");
			} else if (arg === "off") {
				hintsEnabled = false;
				ctx.ui.notify("Auto-delegate hints disabled");
			} else {
				// Toggle
				hintsEnabled = !hintsEnabled;
				ctx.ui.notify(`Auto-delegate hints ${hintsEnabled ? "enabled" : "disabled"}`);
			}
		},
	});
}
