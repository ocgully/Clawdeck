/**
 * Shared vocabulary for Clawdeck. The session lifecycle status is the
 * spine of the whole plugin — icon colors, the attention button, and the
 * ambient glow are all derived from it.
 */

export type SessionStatus = "idle" | "running" | "waiting" | "error" | "ended";

/** Priority used by the "jump to who needs me" button. Higher wins. */
export const STATUS_PRIORITY: Record<SessionStatus, number> = {
  waiting: 4,
  error: 3,
  running: 1,
  idle: 0,
  ended: -1,
};

/** Canonical color per status. Used by the icon engine and ambient glow. */
export const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: "#6B7280", // grey
  running: "#22C55E", // green
  waiting: "#EAB308", // yellow
  error: "#EF4444", // red
  ended: "#374151", // near-black
};

/**
 * Terminal coordinates captured from a session's environment, used to jump
 * focus and type into it.
 *
 * macOS: iTerm2 and Terminal.app, keyed by TTY (works for both).
 * Windows: no TTY exists, so we keep a process id near the session and resolve
 * a window from it at press time.
 */
export interface TermTarget {
  /** TERM_PROGRAM, e.g. "iTerm.app" or "Apple_Terminal". */
  termProgram?: string;
  /** Full ITERM_SESSION_ID / TERM_SESSION_ID, e.g. "w0t1p0:UUID". */
  sessionId?: string;
  /** The GUID portion after the colon — matches `id of session` in iTerm2. */
  guid?: string;
  /** TTY device path (e.g. /dev/ttys003) — the key on macOS/Linux. */
  tty?: string;
  /**
   * Windows only: a process id near the session (the hook's parent). Focus
   * walks ancestors from here to a process owning a window. Captured cheaply —
   * the expensive resolution happens at press time, not in the hook.
   */
  pid?: number;
  /** Windows Terminal's per-tab GUID (WT_SESSION). Recorded for diagnostics. */
  wtSession?: string;
}

/** @deprecated Use {@link TermTarget}. Kept as an alias for compatibility. */
export type ItermTarget = TermTarget;

/** A single tracked Claude Code session. */
export interface SessionInfo {
  id: string;
  cwd: string;
  project: string;
  status: SessionStatus;
  lastEvent: string;
  startedAt: number;
  updatedAt: number;
  model?: string;
  term?: TermTarget;
  /** Path to this session's transcript JSONL — read for suggested next steps. */
  transcriptPath?: string;
  /** Free-form note surfaced on the tile (e.g. the pending permission prompt). */
  note?: string;
}

/** The JSON envelope a hook sends over the unix socket. */
export interface HookMessage {
  type: "event";
  event: string; // Claude Code hook_event_name
  session_id: string;
  cwd?: string;
  transcript_path?: string;
  model?: string;
  note?: string;
  /** Non-zero marks the session errored, regardless of event. */
  exit_code?: number;
  ts: number;
  term?: TermTarget;
}

export const SOCKET_DIR = ".claude/clawdeck";
export const SOCKET_FILE = "deck.sock";
