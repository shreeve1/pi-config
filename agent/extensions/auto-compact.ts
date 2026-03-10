/**
 * Auto-Compact + /cost extension for Pi
 *
 * Monitors context usage after every turn and triggers compaction automatically
 * when usage crosses a configurable percentage threshold (default: 85%).
 *
 * Commands:
 *   /autocompact         — toggle on/off
 *   /autocompact on      — enable
 *   /autocompact off     — disable
 *   /autocompact <N>     — set threshold to N% (clamped 50–99)
 *   /cost                — print cumulative session token usage and cost
 *
 * Footer status: shows "⚡@85%" when enabled, blank when disabled.
 * During compaction: shows "⟳ compacting…"
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ─── Module state ───────────────────────────────────────────────────────────────

let enabled      = true;
let thresholdPct = 85;      // trigger when context usage reaches this %
let compacting   = false;   // guard against concurrent triggers
let compactGeneration = 0;  // tracks session switches to invalidate stale callbacks

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtTok(n: number): string {
  if (n < 1_000)       return `${n}`;
  if (n < 10_000)      return `${(n / 1_000).toFixed(1)}K`;
  if (n < 1_000_000)   return `${Math.round(n / 1_000)}K`;
  if (n < 10_000_000)  return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

function setStatus(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  if (!enabled) {
    ctx.ui.setStatus("auto-compact", "");
    return;
  }
  ctx.ui.setStatus("auto-compact", `⚡@${thresholdPct}%`);
}

function persistState(pi: ExtensionAPI) {
  pi.appendEntry("auto-compact-config", { enabled, thresholdPct });
}

function restoreState(ctx: ExtensionContext) {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "auto-compact-config") {
      const data = entry.data as { enabled?: boolean; thresholdPct?: number };
      enabled = data.enabled ?? true;
      thresholdPct = data.thresholdPct ?? 85;
    }
  }
  compacting = false;
  compactGeneration++;
}

// ─── Extension entry point ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // Restore persisted state and install footer on load / session switch
  pi.on("session_start", (_, ctx) => {
    restoreState(ctx);
    setStatus(ctx);
  });

  pi.on("session_switch", (_, ctx) => {
    restoreState(ctx);
    setStatus(ctx);
  });

  // Keep status fresh after model change (context window size may change)
  pi.on("model_select", (_, ctx) => setStatus(ctx));

  // ─── Core: monitor context after every turn ──────────────────────────────────

  pi.on("turn_end", async (_, ctx) => {
    if (!enabled || compacting) return;
    if (!ctx.hasUI) return;    // don't auto-compact in print / JSON mode

    const usage = ctx.getContextUsage();
    if (!usage || usage.percent == null) return;
    if (usage.percent < thresholdPct) return;

    const pct = usage.percent.toFixed(1);
    const gen = compactGeneration;  // capture to detect stale callbacks

    compacting = true;
    ctx.ui.setStatus("auto-compact", `⟳ compacting (${pct}%)…`);

    ctx.compact({
      customInstructions: `Auto-compact triggered: context was at ${pct}% of the context window.`,
      onComplete: () => {
        if (gen !== compactGeneration) return;  // session changed, ignore
        compacting = false;
        setStatus(ctx);
        ctx.ui.notify(`Auto-compacted at ${pct}% context usage`, "info");
      },
      onError: (err: Error) => {
        if (gen !== compactGeneration) return;  // session changed, ignore
        compacting = false;
        setStatus(ctx);
        ctx.ui.notify(`Auto-compact failed: ${err.message}`, "error");
      },
    });
  });

  // ─── /autocompact command ────────────────────────────────────────────────────

  pi.registerCommand("autocompact", {
    description:
      "Toggle or configure auto-compaction. Usage: /autocompact [on|off|50-99]",
    async handler(args, ctx) {
      const arg = (args ?? "").trim().toLowerCase();

      if (arg === "on") {
        enabled = true;
      } else if (arg === "off") {
        enabled = false;
      } else if (/^\d+$/.test(arg)) {
        const n = parseInt(arg, 10);
        thresholdPct = Math.max(50, Math.min(99, n));
        enabled = true;   // setting a threshold implicitly enables
      } else {
        // bare /autocompact → toggle
        enabled = !enabled;
      }

      persistState(pi);
      setStatus(ctx);
      ctx.ui.notify(
        enabled
          ? `Auto-compact ON — triggers at ${thresholdPct}% context usage`
          : "Auto-compact OFF",
        "info"
      );
    },
  });

  // ─── /cost command ───────────────────────────────────────────────────────────

  pi.registerCommand("cost", {
    description: "Show cumulative session token usage and estimated cost",
    async handler(_args, ctx) {
      let inTok = 0, outTok = 0, cacheRead = 0, cacheWrite = 0, cost = 0, turns = 0;
      let model = "";

      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type !== "message") continue;
        const msg = entry.message;
        if (msg.role === "assistant" && msg.usage) {
          turns++;
          inTok      += msg.usage.input       ?? 0;
          outTok     += msg.usage.output      ?? 0;
          cacheRead  += msg.usage.cacheRead   ?? 0;
          cacheWrite += msg.usage.cacheWrite  ?? 0;
          cost       += msg.usage.cost?.total ?? 0;
          if (msg.model) model = msg.model;
        }
      }

      // Context window info for reference
      const usage = ctx.getContextUsage();
      const ctxLine = usage
        ? `Context:    ${fmtTok(usage.tokens ?? 0)} / ${fmtTok(usage.contextWindow ?? 0)} (${(usage.percent ?? 0).toFixed(1)}%)`
        : "";

      const lines = [
        `Model:      ${model || ctx.model?.id || "unknown"}`,
        `Turns:      ${turns}`,
        `─────────────────────────`,
        `Input:      ${fmtTok(inTok)} tokens`,
        `Output:     ${fmtTok(outTok)} tokens`,
        cacheRead  > 0 ? `Cache read: ${fmtTok(cacheRead)} tokens`  : null,
        cacheWrite > 0 ? `Cache write:${fmtTok(cacheWrite)} tokens` : null,
        `─────────────────────────`,
        cost > 0
          ? `Cost:       $${cost.toFixed(4)}`
          : "Cost:       $0.0000",
        ctxLine || null,
      ].filter(Boolean).join("\n");

      ctx.ui.notify(lines, "info");
    },
  });
}
