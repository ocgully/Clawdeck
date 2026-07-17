#!/usr/bin/env node
/** Stop and remove the Clawdeck launchd agent. Run: npm run service:uninstall */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LABEL = "com.clawdeck.daemon";
const plistPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const uid = process.getuid?.() ?? 501;

sh(`launchctl bootout gui/${uid}/${LABEL}`, true);
sh(`launchctl unload ${JSON.stringify(plistPath)}`, true); // older macOS fallback

if (existsSync(plistPath)) {
  rmSync(plistPath);
  console.log(`✓ Removed ${plistPath}`);
} else {
  console.log("No launchd agent installed.");
}
console.log("✓ Clawdeck service stopped. The deck keeps its last frame.");

function sh(cmd, ignoreError = false) {
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (err) {
    if (!ignoreError) console.error(`  (warn) ${cmd} → ${err.message.split("\n")[0]}`);
  }
}
