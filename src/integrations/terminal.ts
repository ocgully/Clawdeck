import { execFile } from "node:child_process";
import type { TermTarget } from "../types";

/**
 * Bring a specific terminal session to the foreground. Supports iTerm2 and
 * macOS Terminal.app; the strategy is chosen from the captured TERM_PROGRAM.
 *
 *  - iTerm2: match on the session GUID (from ITERM_SESSION_ID), TTY as backup.
 *  - Terminal.app: match on the tab's TTY, the only stable handle it exposes.
 *
 * Focus is best-effort: the pane may have closed, in which case we just log.
 */
export function focusTerminal(target: TermTarget | undefined): void {
  if (!target) return;
  const isAppleTerminal = target.termProgram === "Apple_Terminal";
  const script = isAppleTerminal ? appleTerminalScript(target) : itermScript(target);
  if (!script) return;

  execFile("/usr/bin/osascript", ["-e", script], (err) => {
    if (err) process.stderr.write(`[claudedeck] terminal focus failed: ${err.message}\n`);
  });
}

function itermScript(target: TermTarget): string | undefined {
  if (!target.guid && !target.tty) return undefined;
  const guid = target.guid ? esc(target.guid) : "";
  const tty = target.tty ? esc(target.tty) : "";
  return `
tell application "iTerm2"
  activate
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        set matchGuid to (${guid ? `id of s is "${guid}"` : "false"})
        set matchTty to (${tty ? `tty of s is "${tty}"` : "false"})
        if matchGuid or matchTty then
          select w
          tell t to select
          select s
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`.trim();
}

function appleTerminalScript(target: TermTarget): string | undefined {
  if (!target.tty) return undefined;
  const tty = esc(target.tty);
  return `
tell application "Terminal"
  activate
  repeat with w in windows
    repeat with t in tabs of w
      if tty of t is "${tty}" then
        set selected tab of w to t
        set index of w to 1
        return
      end if
    end repeat
  end repeat
end tell`.trim();
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
