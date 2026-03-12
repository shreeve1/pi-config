import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { installDir, cronRoot, ensureDirs } from "./paths.js";

const AGENT_LABEL = "com.pi.cron.tick";
const PLIST_FILENAME = "com.pi.cron.tick.plist";

const require = createRequire(import.meta.url);
const thisDir = dirname(fileURLToPath(import.meta.url));
const runnerPath = join(thisDir, "..", "runner.ts");
const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const launchAgentPlistPath = join(launchAgentsDir, PLIST_FILENAME);

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const quoteShell = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const resolveJitiRegisterPath = (): string => {
  try {
    const jitiPackagePath = require.resolve("@mariozechner/jiti/package.json");
    return join(dirname(jitiPackagePath), "lib", "jiti-register.mjs");
  } catch {
    return "@mariozechner/jiti/register";
  }
};

const buildPlist = (
  nodeBinary: string,
  jitiRegisterPath: string,
  envPath: string,
): string => {
  const outLog = join(cronRoot(), "logs", "tick-stdout.log");
  const errLog = join(cronRoot(), "logs", "tick-stderr.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(AGENT_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodeBinary)}</string>
    <string>--import</string>
    <string>${xmlEscape(jitiRegisterPath)}</string>
    <string>${xmlEscape(runnerPath)}</string>
    <string>tick</string>
  </array>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(errLog)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(envPath)}</string>
    <key>HOME</key>
    <string>${xmlEscape(homedir())}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
};

export const installLaunchd = (): { success: boolean; message: string } => {
  try {
    ensureDirs();

    const nodeBinary = execSync("which node").toString().trim();
    const jitiRegisterPath = resolveJitiRegisterPath();
    const plistContent = buildPlist(nodeBinary, jitiRegisterPath, process.env.PATH ?? "");
    const localInstallPath = join(installDir(), PLIST_FILENAME);

    writeFileSync(localInstallPath, plistContent, "utf8");

    execSync(`mkdir -p ${quoteShell(launchAgentsDir)}`);
    writeFileSync(launchAgentPlistPath, plistContent, "utf8");

    try {
      execSync(`launchctl unload ${quoteShell(launchAgentPlistPath)}`);
    } catch {
      // ignore unload failures (e.g., not loaded yet)
    }

    execSync(`launchctl load ${quoteShell(launchAgentPlistPath)}`);

    return {
      success: true,
      message: `Installed and loaded ${AGENT_LABEL} at ${launchAgentPlistPath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to install launchd agent: ${message}`,
    };
  }
};

export const uninstallLaunchd = (): { success: boolean; message: string } => {
  try {
    try {
      execSync(`launchctl unload ${quoteShell(launchAgentPlistPath)}`);
    } catch {
      // ignore unload failures
    }

    execSync(`rm -f ${quoteShell(launchAgentPlistPath)}`);

    return {
      success: true,
      message: `Uninstalled ${AGENT_LABEL}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to uninstall launchd agent: ${message}`,
    };
  }
};

export const checkInstallation = (): { installed: boolean; details: string } => {
  const checks: string[] = [];

  const plistExists = existsSync(launchAgentPlistPath);
  checks.push(`plist in LaunchAgents: ${plistExists ? "yes" : "no"}`);

  let listed = false;
  try {
    const output = execSync(`launchctl list | grep ${quoteShell(AGENT_LABEL)}`).toString().trim();
    listed = output.length > 0;
  } catch {
    listed = false;
  }
  checks.push(`launchctl listed: ${listed ? "yes" : "no"}`);

  const runnerExists = existsSync(runnerPath);
  checks.push(`runner exists: ${runnerExists ? "yes" : "no"} (${runnerPath})`);

  if (plistExists) {
    try {
      const plist = readFileSync(launchAgentPlistPath, "utf8");
      checks.push(`plist label ok: ${plist.includes(`<string>${AGENT_LABEL}</string>`) ? "yes" : "no"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push(`plist readable: no (${message})`);
    }
  }

  const installed = plistExists && listed && runnerExists;
  return {
    installed,
    details: checks.join("; "),
  };
};
