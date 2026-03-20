/**
 * Claude Code-style footer for Pi
 *
 * Line 1: [model-id] ████░░░░ 18.0% ⊕8↑80 ⚡35.7K Σ:1.3K/1.3K (max:200K)
 * Line 2: ~/path (branch) • session name
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

function fmtTok(n: number): string {
  if (n < 1_000)     return `${n}`;
  if (n < 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function progressBar(pct: number, width: number): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export default function (pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let toolCalls = 0;
  let lastTurnOutput = 0;

  function installFooter(c: ExtensionContext) {
    ctx = c;
    // setFooter is only available in TUI mode, not in RPC mode
    if (!c.hasUI || !c.ui.setFooter) return;

    c.ui.setFooter((_tui, theme, footerData) => ({
      render(width: number): string[] {
        if (!ctx) return [];

        // Accumulate token stats from all assistant messages in the session
        let inTok = 0, outTok = 0, cacheR = 0, cost = 0;
        for (const entry of ctx.sessionManager.getEntries()) {
          if (entry.type === "message") {
            const msg = (entry as any).message;
            if (msg?.role === "assistant" && msg.usage) {
              inTok  += msg.usage.input       ?? 0;
              outTok += msg.usage.output      ?? 0;
              cacheR += msg.usage.cacheRead   ?? 0;
              cost   += msg.usage.cost?.total ?? 0;
            }
          }
        }

        // Context window info
        const cu   = ctx.getContextUsage();
        const pct  = cu?.percent ?? 0;
        const ctxT = cu?.tokens  ?? null;   // tokens currently in context window
        const ctxW = cu?.contextWindow ?? 0;
        const pctS = cu?.percent !== null ? `${pct.toFixed(1)}%` : "?%";

        // Model
        const modelId = ctx.model?.id ?? "no model";
        const isOAuth  = ctx.model
          ? (ctx as any).modelRegistry?.isUsingOAuth?.(ctx.model) ?? false
          : false;

        // CWD / branch / session name for line 2
        let pwd = process.cwd();
        const home = process.env.HOME ?? "";
        if (home && pwd.startsWith(home)) pwd = "~" + pwd.slice(home.length);
        const branch = footerData.getGitBranch();
        if (branch) pwd += ` (${branch})`;
        const sname = ctx.sessionManager.getSessionName();
        if (sname) pwd += ` • ${sname}`;

        // Colour helpers based on context usage
        const barColor = pct > 90 ? "error" : pct > 70 ? "warning" : "success";
        const pctColor = pct > 90 ? "error" : pct > 70 ? "warning" : "dim";

        // ── Line 1 ────────────────────────────────────────────────────────
        const parts: string[] = [];

        // [model-id]
        parts.push(theme.fg("accent", `[${modelId}]`));

        // progress bar
        parts.push(theme.fg(barColor, progressBar(pct, 12)));

        // percentage
        parts.push(theme.fg(pctColor, pctS));

        // ⊕toolCalls↑lastTurnOutput  (per-turn stats, CC-style)
        const turnStats: string[] = [];
        if (toolCalls > 0)      turnStats.push(`⊕${fmtTok(toolCalls)}`);
        if (lastTurnOutput > 0) turnStats.push(`↑${fmtTok(lastTurnOutput)}`);
        if (turnStats.length)   parts.push(turnStats.join(""));

        // ⚡context-tokens (tokens currently occupying the context window)
        if (ctxT !== null) parts.push(theme.fg("warning", `⚡${fmtTok(ctxT)}`));

        // Σ:input/output (max:window)  –  cumulative session token accounting
        const sigmaParts: string[] = [];
        if (inTok || outTok) sigmaParts.push(`Σ:${fmtTok(inTok)}/${fmtTok(outTok)}`);
        if (ctxW)            sigmaParts.push(`(max:${fmtTok(ctxW)})`);
        if (sigmaParts.length) parts.push(theme.fg("dim", sigmaParts.join(" ")));

        // cost (shown only when using API key, not OAuth subscription)
        if (cost > 0 && !isOAuth) {
          parts.push(theme.fg("dim", `$${cost.toFixed(3)}`));
        } else if (isOAuth) {
          parts.push(theme.fg("dim", "(sub)"));
        }

        const line1 = parts.join(" ");

        // ── Line 2 ────────────────────────────────────────────────────────
        const statuses = Array.from(footerData.getExtensionStatuses().values());
        const line2Raw = statuses.length
          ? `${pwd} • ${statuses.join(" • ")}`
          : pwd;
        const line2 = theme.fg("dim", line2Raw);

        return [
          truncateToWidth(line1, width, theme.fg("dim", "…")),
          truncateToWidth(line2, width, theme.fg("dim", "…")),
        ];
      },
      invalidate() {
        // Footer doesn't cache anything, no-op
      },
    }));
  }

  // Install footer on session start and re-install after switch
  pi.on("session_start", (_, c) => installFooter(c));
  pi.on("session_switch", (_, c) => {
    toolCalls = 0;
    lastTurnOutput = 0;
    installFooter(c);
  });

  // Keep ctx fresh after each agent activity so render() sees current data
  pi.on("agent_end",  (_, c) => { ctx = c; });
  pi.on("model_select", (_, c) => { ctx = c; });

  // Track per-turn stats
  pi.on("tool_execution_start", (_, c) => {
    ctx = c;
    toolCalls++;
  });

  pi.on("turn_end", (event, c) => {
    ctx = c;
    // Capture output tokens for the most recent turn (CC-style ↑N display)
    const msg = (event as any).message;
    if (msg?.role === "assistant" && msg.usage?.output) {
      lastTurnOutput = msg.usage.output;
    }
  });
}
