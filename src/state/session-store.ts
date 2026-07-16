import { EventEmitter } from "node:events";
import { basename } from "node:path";
import {
  type HookMessage,
  type SessionInfo,
  type SessionStatus,
  STATUS_PRIORITY,
} from "../types";

/**
 * Maps Claude Code hook events onto our four-color status model. This is the
 * single source of truth every action reads from.
 *
 *   SessionStart              -> idle    (just spun up, no prompt yet)
 *   UserPromptSubmit          -> running (you gave it work)
 *   PreToolUse / PostToolUse  -> running (it's mid-flight)
 *   Notification              -> waiting (needs a decision from you)
 *   Stop / SubagentStop       -> idle    (turn finished, sitting there)
 *   SessionEnd                -> ended   (pruned shortly after)
 *   ApiError                  -> error   (synthetic, from the transcript watcher)
 *   ApiRecovered              -> running (synthetic, the API call succeeded again)
 */
const EVENT_STATUS: Record<string, SessionStatus> = {
  SessionStart: "idle",
  UserPromptSubmit: "running",
  PreToolUse: "running",
  PostToolUse: "running",
  Notification: "waiting",
  Stop: "idle",
  SubagentStop: "running",
  PreCompact: "running",
  SessionEnd: "ended",
  ApiError: "error",
  ApiRecovered: "running",
};

/** Sessions that go quiet for this long are assumed dead and pruned. */
const STALE_MS = 1000 * 60 * 30;
/** Ended sessions linger briefly so the tile can show a fade-out. */
const ENDED_GRACE_MS = 1000 * 8;

export class SessionStore extends EventEmitter {
  private readonly sessions = new Map<string, SessionInfo>();

  constructor() {
    super();
    // Prune on a slow cadence; the 'change' event redraws affected tiles.
    setInterval(() => this.prune(), 1000 * 15).unref();
  }

  /** Apply an inbound hook message and emit 'change' if anything moved. */
  apply(msg: HookMessage): void {
    const now = msg.ts || Date.now();
    const existing = this.sessions.get(msg.session_id);
    const cwd = msg.cwd || existing?.cwd || "";

    let status: SessionStatus =
      EVENT_STATUS[msg.event] ?? existing?.status ?? "idle";
    if (typeof msg.exit_code === "number" && msg.exit_code !== 0) {
      status = "error";
    }
    // Sticky error: a real API error stays red until the session actually moves
    // forward (a new prompt, or the watcher's ApiRecovered). A plain turn-end
    // (Stop) must not quietly downgrade a stuck session to idle.
    if (
      existing?.status === "error" &&
      (msg.event === "Stop" || msg.event === "SubagentStop")
    ) {
      status = "error";
    }

    const info: SessionInfo = {
      id: msg.session_id,
      cwd,
      project: existing?.project ?? (cwd ? basename(cwd) : "session"),
      status,
      lastEvent: msg.event,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      model: msg.model ?? existing?.model,
      term: mergeTerm(existing?.term, msg.term),
      transcriptPath: msg.transcript_path ?? existing?.transcriptPath,
      note:
        status === "waiting" || status === "error"
          ? msg.note ?? existing?.note
          : undefined,
    };

    this.sessions.set(msg.session_id, info);
    this.emit("change");
  }

  /**
   * Stable first-seen order: sessions fill the deck left-to-right, top-to-bottom
   * and stay put — a new session appends to the next free slot rather than
   * shuffling the others. Ended sessions sink to the bottom before they prune.
   */
  list(): SessionInfo[] {
    return [...this.sessions.values()].sort((a, b) => {
      if ((a.status === "ended") !== (b.status === "ended")) {
        return a.status === "ended" ? 1 : -1;
      }
      return a.startedAt - b.startedAt;
    });
  }

  get(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  /** The session that most deserves your attention right now, if any. */
  mostUrgent(): SessionInfo | undefined {
    let best: SessionInfo | undefined;
    for (const s of this.sessions.values()) {
      if (STATUS_PRIORITY[s.status] < STATUS_PRIORITY.running) continue;
      if (
        !best ||
        STATUS_PRIORITY[s.status] > STATUS_PRIORITY[best.status] ||
        (STATUS_PRIORITY[s.status] === STATUS_PRIORITY[best.status] &&
          s.updatedAt < best.updatedAt)
      ) {
        best = s;
      }
    }
    return best;
  }

  /** Highest-priority status across all sessions — drives the ambient glow. */
  peakStatus(): SessionStatus {
    let peak: SessionStatus = "idle";
    for (const s of this.sessions.values()) {
      if (STATUS_PRIORITY[s.status] > STATUS_PRIORITY[peak]) peak = s.status;
    }
    return peak;
  }

  private prune(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, s] of this.sessions) {
      const dead =
        (s.status === "ended" && now - s.updatedAt > ENDED_GRACE_MS) ||
        now - s.updatedAt > STALE_MS;
      if (dead) {
        this.sessions.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit("change");
  }
}

function mergeTerm(
  prev: SessionInfo["term"],
  next: SessionInfo["term"],
): SessionInfo["term"] {
  if (!prev && !next) return undefined;
  return { ...prev, ...next };
}
