import { createRequire } from "node:module";

/**
 * macOS gates reading HID input (button presses) behind the Input Monitoring
 * privacy permission — writing images to keys is unaffected, which is why an
 * unpermitted deck renders fine but never registers a press.
 *
 * On startup we check the status and, if needed, trigger the native prompt so
 * the user gets a one-click path to System Settings instead of silent dead keys.
 */
export interface InputMonitoringState {
  platform: NodeJS.Platform;
  status: string; // "authorized" | "denied" | "not determined" | "restricted" | "n/a"
  authorized: boolean;
}

export function checkInputMonitoring(prompt = false): InputMonitoringState {
  if (process.platform !== "darwin") {
    return { platform: process.platform, status: "n/a", authorized: true };
  }
  try {
    const require = createRequire(import.meta.url);
    const perms = require("node-mac-permissions");
    const status: string = perms.getAuthStatus("input-monitoring");
    const authorized = status === "authorized";
    if (!authorized && prompt) {
      // Surfaces the system prompt / opens the Input Monitoring settings pane.
      try {
        perms.askForInputMonitoringAccess();
      } catch {
        /* best effort */
      }
    }
    return { platform: "darwin", status, authorized };
  } catch {
    // If the native module fails to load, don't block the daemon.
    return { platform: "darwin", status: "unknown", authorized: true };
  }
}

/** Human-facing guidance printed when presses won't work yet. */
export function inputMonitoringHelp(): string {
  return [
    "",
    "  ┌─────────────────────────────────────────────────────────────┐",
    "  │  Key presses need macOS Input Monitoring permission.          │",
    "  │  The deck will render, but presses won't register until you:  │",
    "  │                                                               │",
    "  │  1. System Settings → Privacy & Security → Input Monitoring    │",
    "  │  2. Enable the terminal (or app) running this daemon           │",
    "  │  3. Quit & reopen that terminal, then start again              │",
    "  │                                                               │",
    "  │  Tip: run in a DIFFERENT terminal than your Claude session so  │",
    "  │  you don't have to restart the one you're chatting in.         │",
    "  └─────────────────────────────────────────────────────────────┘",
    "",
  ].join("\n");
}
