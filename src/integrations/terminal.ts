import type { TermTarget } from "../types";
import * as darwin from "./terminal-darwin";
import * as win32 from "./terminal-win32";

/**
 * Terminal control, dispatched per platform. Both implementations are
 * best-effort by nature — the session's window may have closed, and each OS
 * gives us a different (imperfect) handle on it. See the platform modules for
 * what each can and can't do.
 *
 * Linux is not supported yet: there's no portable way to identify and raise a
 * specific terminal across the many emulators/compositors, so we no-op rather
 * than focus the wrong window.
 */
const impl = process.platform === "win32" ? win32 : process.platform === "darwin" ? darwin : undefined;

/** Bring the terminal running this session to the foreground. */
export function focusTerminal(target: TermTarget | undefined): void {
  impl?.focusTerminal(target);
}

/** Type text into the session's terminal and submit it. */
export function sendText(target: TermTarget | undefined, text: string): void {
  impl?.sendText(target, text);
}

/** True when the current platform can drive terminals at all. */
export function terminalControlSupported(): boolean {
  return impl !== undefined;
}
