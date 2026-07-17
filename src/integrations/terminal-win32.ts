import { execFile } from "node:child_process";
import type { TermTarget } from "../types";

/**
 * Windows terminal control.
 *
 * Windows has no TTY, and no scriptable equivalent of AppleScript's "select
 * this session". What we do have is a process id near the Claude session (the
 * hook's parent). From it we walk up the process tree until we find an ancestor
 * that owns a window, and raise that window.
 *
 * KNOWN LIMITATION — Windows Terminal hosts every tab in a SINGLE window and
 * process, and exposes no public API to activate a specific tab. So on Windows
 * Terminal we can raise the *window* but not select the exact tab: several
 * sessions in different tabs resolve to the same window. Classic conhost
 * consoles (one window per process, e.g. a standalone PowerShell window) focus
 * precisely. `WT_SESSION` identifies the tab but there is nothing to hand it to.
 *
 * Typing uses SendKeys against the focused window — inherently best-effort,
 * since it depends on the window actually having focus.
 */

const PS = "powershell.exe";
const PS_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

/** Walk ancestors from `pid` to the first process with a window, and raise it. */
function focusScript(pid: number): string {
  return `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClawWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@
$target = ${pid}
for ($i = 0; $i -lt 12; $i++) {
  $p = Get-Process -Id $target -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
    if ([ClawWin]::IsIconic($p.MainWindowHandle)) { [ClawWin]::ShowWindow($p.MainWindowHandle, 9) | Out-Null }
    [ClawWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    exit 0
  }
  $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$target" -ErrorAction SilentlyContinue).ParentProcessId
  if (-not $parent -or $parent -eq 0 -or $parent -eq $target) { break }
  $target = $parent
}
exit 1`.trim();
}

export function focusTerminal(target: TermTarget | undefined): void {
  if (!target?.pid) return;
  run(focusScript(target.pid), "focus");
}

/**
 * Focus the window, then type. SendKeys goes to whatever is focused, so the two
 * must happen in one script — otherwise the user could click away between them.
 */
export function sendText(target: TermTarget | undefined, text: string): void {
  if (!target?.pid) return;
  const script = `
${focusScript(target.pid)}
Start-Sleep -Milliseconds 120
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapeSendKeys(text)}{ENTER}')`.trim();
  run(script, "send");
}

/**
 * SendKeys treats + ^ % ~ ( ) { } [ ] as control characters; each must be
 * wrapped in braces to be typed literally. Single quotes are doubled because
 * the payload is embedded in a PowerShell single-quoted string.
 */
export function escapeSendKeys(text: string): string {
  return text
    .replace(/[+^%~(){}\[\]]/g, (c) => `{${c}}`)
    .replace(/'/g, "''");
}

function run(script: string, what: string): void {
  execFile(PS, [...PS_ARGS, script], { windowsHide: true }, (err) => {
    if (err) process.stderr.write(`[clawdeck] windows ${what} failed: ${err.message}\n`);
  });
}
