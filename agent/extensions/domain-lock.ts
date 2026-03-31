// Domain Lock Extension
// Enforces path-level write boundaries for agents.
// Reads allowed paths from PI_ALLOWED_WRITE_PATHS environment variable (comma-separated).
// Blocks write/edit operations outside allowed paths.
// Known limitation: bash commands can bypass this enforcement.

import * as path from "path";
import * as fs from "fs";

let cachedTeamWriteMapRaw: string | undefined;
let cachedTeamWriteMap: Record<string, string[]> = {};

function getTeamWriteMap(): Record<string, string[]> {
  const raw = process.env.PI_TEAM_WRITE_MAP;
  if (!raw) {
    cachedTeamWriteMapRaw = undefined;
    cachedTeamWriteMap = {};
    return cachedTeamWriteMap;
  }
  if (raw === cachedTeamWriteMapRaw) return cachedTeamWriteMap;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const normalized: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof k !== "string") continue;
        if (Array.isArray(v)) {
          normalized[k] = v.filter((name): name is string => typeof name === "string");
        } else if (typeof v === "string") {
          normalized[k] = [v];
        }
      }
      cachedTeamWriteMap = normalized;
    } else {
      cachedTeamWriteMap = {};
    }
  } catch {
    cachedTeamWriteMap = {};
  }
  cachedTeamWriteMapRaw = raw;
  return cachedTeamWriteMap;
}

export default function domainLock(pi: any) {
  pi.on("tool_call", async (event: any, ctx: any) => {
    // Only intercept write and edit tools
    if (event.toolName !== "write" && event.toolName !== "edit") {
      return;
    }

    const targetPath = event.input?.path;
    if (!targetPath) return;

    // Read allowed paths from environment
    const allowedPathsEnv = process.env.PI_ALLOWED_WRITE_PATHS;
    
    // If no env var set, don't enforce (backwards compatible)
    if (allowedPathsEnv === undefined) return;
    
    // Resolve the target path
    const cwd = ctx?.cwd || process.cwd();
    const resolvedTarget = path.resolve(cwd, targetPath);
    
    // Try to canonicalize via realpath (handles symlinks)
    let canonicalTarget = resolvedTarget;
    try {
      // For new files, canonicalize the parent directory
      const parentDir = path.dirname(resolvedTarget);
      if (fs.existsSync(parentDir)) {
        canonicalTarget = path.join(fs.realpathSync(parentDir), path.basename(resolvedTarget));
      }
    } catch {}

    // Always allow writes to session-notes and expertise files
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    let piAgentDir = path.join(homeDir, ".pi", "agent");
    try { piAgentDir = fs.realpathSync(piAgentDir); } catch {}
    if (canonicalTarget.startsWith(piAgentDir + path.sep) || canonicalTarget === piAgentDir) {
      return;
    }
    
    // Also allow writes to ~/.pi/logs/
    let piLogsDir = path.join(homeDir, ".pi", "logs");
    try { piLogsDir = fs.realpathSync(piLogsDir); } catch {}
    if (canonicalTarget.startsWith(piLogsDir + path.sep) || canonicalTarget === piLogsDir) {
      return;
    }

    // Parse allowed paths
    const allowedPaths = allowedPathsEnv
      .split(",")
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => path.resolve(cwd, p));

    // If allowed paths list is empty and env var was set, block everything
    // (read-only agents get PI_ALLOWED_WRITE_PATHS="" which means no writes allowed)
    
    // Check if target is within any allowed path
    const isAllowed = allowedPaths.some(allowed => {
      const relative = path.relative(allowed, canonicalTarget);
      // If relative path doesn't start with "..", the target is inside the allowed dir
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    });

    if (!isAllowed) {
      // Log violation
      logViolation({
        timestamp: new Date().toISOString(),
        agent: process.env.PI_AGENT_NAME || "unknown",
        team: process.env.PI_TEAM_NAME || "unknown",
        attempted_path: targetPath,
        resolved_path: canonicalTarget,
        allowed_paths: allowedPaths.map(p => path.relative(cwd, p)),
        action: "denied"
      });

      const allowedList = allowedPaths.length > 0 
        ? allowedPaths.map(p => path.relative(cwd, p)).join(", ")
        : "(none - read-only agent)";

      const currentAgent = (process.env.PI_AGENT_NAME || process.env.AGENT_NAME || "").toLowerCase();
      const teamWriteMap = getTeamWriteMap();
      const suggested = new Set<string>();
      for (const [prefix, names] of Object.entries(teamWriteMap)) {
        const resolvedPrefix = path.resolve(cwd, prefix);
        const prefixMatchesTarget = canonicalTarget.startsWith(resolvedPrefix + path.sep) || canonicalTarget === resolvedPrefix;
        const targetMatchesPrefix = resolvedPrefix.startsWith(canonicalTarget + path.sep) || resolvedPrefix === canonicalTarget;
        if (!prefixMatchesTarget && !targetMatchesPrefix) continue;
        for (const name of names) {
          if (!name) continue;
          const normalized = name.toLowerCase().replace(/\s+/g, "-");
          if (normalized !== currentAgent) suggested.add(name);
        }
      }

      const delegateHint = suggested.size > 0
        ? ` Suggested delegates: ${Array.from(suggested).join(", ")}.`
        : " Consider delegating this task to a team member with appropriate write access.";
      
      return {
        block: true,
        reason: `Domain lock: Cannot write to "${targetPath}". Allowed write paths: [${allowedList}].${delegateHint}`
      };
    }
  });
}

function logViolation(entry: Record<string, any>) {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const logDir = path.join(homeDir, ".pi", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "domain-violations.jsonl");
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch {
    // Don't crash on logging failures
  }
}
