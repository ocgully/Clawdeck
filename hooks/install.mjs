#!/usr/bin/env node
/**
 * Wire Clawdeck into Claude Code and drop in the example monitors.
 *
 * Idempotent: re-running removes any prior Clawdeck hook entries first, so
 * it's safe to run after moving the repo. We hook only the events needed to
 * derive the four statuses — no per-tool spam, so Claude stays snappy.
 *
 *   SessionStart   -> idle       Stop / SubagentStop -> idle
 *   UserPromptSubmit -> running  Notification        -> waiting
 *   SessionEnd     -> ended
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const hookPath = path.join(here, "clawdeck-hook.mjs");
const nodeBin = process.execPath;
const command = `${quote(nodeBin)} ${quote(hookPath)}`;
// Match our own entries so re-running is idempotent. The legacy tag is kept so
// installs from before the Clawdeck rename get cleaned up rather than duplicated.
const TAGS = ["clawdeck-hook.mjs", "claudedeck-hook.mjs"];
const isOurs = (cmd) => TAGS.some((t) => String(cmd || "").includes(t));

const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "SessionEnd",
];

const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const settings = readJson(settingsPath);
settings.hooks ??= {};

for (const event of EVENTS) {
  const groups = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  // Strip any prior Clawdeck entries so re-running doesn't duplicate.
  const cleaned = groups
    .map((g) => ({
      ...g,
      hooks: (g.hooks || []).filter((h) => !isOurs(h.command)),
    }))
    .filter((g) => (g.hooks || []).length > 0);
  cleaned.push({ hooks: [{ type: "command", command }] });
  settings.hooks[event] = cleaned;
}

fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log(`✓ Hooked ${EVENTS.length} events in ${settingsPath}`);

// Install example monitor scripts.
const monitorsSrc = path.join(repo, "monitors");
const monitorsDst = path.join(os.homedir(), ".claude", "clawdeck", "monitors");
fs.mkdirSync(monitorsDst, { recursive: true });
if (fs.existsSync(monitorsSrc)) {
  for (const file of fs.readdirSync(monitorsSrc)) {
    if (!file.endsWith(".sh")) continue;
    const dst = path.join(monitorsDst, file);
    fs.copyFileSync(path.join(monitorsSrc, file), dst);
    fs.chmodSync(dst, 0o755);
  }
  console.log(`✓ Installed example monitors to ${monitorsDst}`);
}

try {
  execSync("chmod +x " + quote(hookPath));
} catch {}

console.log("\nDone. Restart any open Claude Code sessions so the hooks load.");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function quote(s) {
  return `"${s.replace(/"/g, '\\"')}"`;
}
