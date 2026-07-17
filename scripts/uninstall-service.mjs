#!/usr/bin/env node
/** Stop and remove the Clawdeck login service. Run: npm run service:uninstall */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LABEL = "com.clawdeck.daemon";
const TASK = "Clawdeck";

if (process.platform === "win32") {
  uninstallWindows();
} else {
  uninstallLaunchd();
}

function uninstallLaunchd() {
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
  done();
}

function uninstallWindows() {
  const vbs = join(homedir(), ".claude", "clawdeck", "clawdeck-launch.vbs");
  sh(`schtasks /End /TN "${TASK}"`, true);
  const removed = sh(`schtasks /Delete /TN "${TASK}" /F`, true);
  console.log(removed ? `✓ Removed scheduled task "${TASK}"` : "No scheduled task installed.");
  // Kill a running daemon; the task only controls startup, not the live process.
  sh(`taskkill /F /IM wscript.exe /FI "WINDOWTITLE eq clawdeck*"`, true);
  if (existsSync(vbs)) {
    rmSync(vbs);
    console.log(`✓ Removed ${vbs}`);
  }
  done();
}

function done() {
  console.log("✓ Clawdeck service stopped. The deck keeps its last frame.");
}

function sh(cmd, ignoreError = false) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch (err) {
    if (!ignoreError) console.error(`  (warn) ${cmd} → ${err.message.split("\n")[0]}`);
    return false;
  }
}
