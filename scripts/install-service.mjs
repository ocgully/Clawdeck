#!/usr/bin/env node
/**
 * Install ClaudeDeck as a launchd LaunchAgent so it runs headless at login and
 * relaunches if it exits — the "install and forget" replacement for the Elgato
 * app. Run: npm run service:install  (builds first via the npm script).
 *
 * Note: the agent runs `node dist/claudedeck.mjs`, so macOS attributes Input
 * Monitoring / Automation permission to your Node binary. On first run it will
 * prompt (or log guidance); grant both once. A signed .app with its own bundle
 * id is the cleaner long-term identity — that's the next packaging step.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "com.claudedeck.daemon";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(repo, "dist", "claudedeck.mjs");
const node = process.execPath;
const logDir = join(homedir(), ".claude", "claudedeck");
const plistPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

if (!existsSync(entry)) {
  console.error(`Build first — missing ${entry}. Run: npm run build`);
  process.exit(1);
}
mkdirSync(logDir, { recursive: true });
mkdirSync(dirname(plistPath), { recursive: true });

// launchd does not expand ~ — every path must be absolute.
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${entry}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${repo}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${join(logDir, "daemon.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(logDir, "daemon.err.log")}</string>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;

writeFileSync(plistPath, plist);
console.log(`✓ Wrote ${plistPath}`);

// Reload cleanly whether or not it was already loaded.
const uid = process.getuid?.() ?? 501;
sh(`launchctl bootout gui/${uid}/${LABEL}`, true);
sh(`launchctl bootstrap gui/${uid} ${JSON.stringify(plistPath)}`) ||
  sh(`launchctl load -w ${JSON.stringify(plistPath)}`); // fallback for older macOS
sh(`launchctl kickstart -k gui/${uid}/${LABEL}`, true);

console.log(`✓ Loaded launchd agent ${LABEL}`);
console.log(`  Logs: ${join(logDir, "daemon.log")}`);
console.log("");
console.log("Heads-up:");
console.log("  • Don't also run `npm start` — two processes can't own the deck.");
console.log("  • First run will need Input Monitoring + Automation granted to Node.");
console.log("  • Uninstall any time with: npm run service:uninstall");

function sh(cmd, ignoreError = false) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch (err) {
    if (!ignoreError) console.error(`  (warn) ${cmd} → ${err.message.split("\n")[0]}`);
    return false;
  }
}
