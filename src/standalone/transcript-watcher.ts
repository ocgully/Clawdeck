import { EventEmitter } from "node:events";
import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * Tails each active session's Claude Code transcript (JSONL) and surfaces the
 * one signal hooks don't give us: in-session API errors. Claude writes a
 * `{type:"system", subtype:"api_error"}` line with the HTTP status and retry
 * progress when a request fails (429 rate limit, 529 overloaded, 5xx, timeout).
 *
 * Emits:
 *   'error'     { sessionId, label }  — an api_error line appeared
 *   'recovered' { sessionId }         — real progress after a prior error
 *
 * We start reading at end-of-file so only NEW errors count, and we only emit
 * 'recovered' for sessions we previously flagged, to avoid chatter.
 */
export interface ApiErrorEvent {
  sessionId: string;
  status?: number;
  label: string;
}

interface Tracked {
  path: string;
  offset: number;
  buf: string;
}

export class TranscriptWatcher extends EventEmitter {
  private tracked = new Map<string, Tracked>();
  private errored = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  start(): void {
    this.timer = setInterval(() => this.poll(), 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.tracked.clear();
  }

  /** Begin (or update) watching a session's transcript, from its current end. */
  track(sessionId: string, path: string): void {
    const cur = this.tracked.get(sessionId);
    if (cur && cur.path === path) return;
    let offset = 0;
    try {
      offset = statSync(path).size;
    } catch {
      /* file not there yet — offset 0, poll will catch up */
    }
    this.tracked.set(sessionId, { path, offset, buf: "" });
  }

  /** Drop any tracked sessions that no longer exist. */
  retainOnly(ids: Set<string>): void {
    for (const id of this.tracked.keys()) {
      if (!ids.has(id)) {
        this.tracked.delete(id);
        this.errored.delete(id);
      }
    }
  }

  /** One read pass over all tracked transcripts. Public so tests can drive it. */
  poll(): void {
    for (const [sid, st] of this.tracked) {
      let size: number;
      try {
        size = statSync(st.path).size;
      } catch {
        continue;
      }
      if (size < st.offset) st.offset = 0; // file rotated/truncated
      if (size <= st.offset) continue;

      const chunk = this.readRange(st.path, st.offset, size - st.offset);
      if (chunk === undefined) continue;
      st.offset = size;
      st.buf += chunk;

      let nl: number;
      while ((nl = st.buf.indexOf("\n")) >= 0) {
        const line = st.buf.slice(0, nl).trim();
        st.buf = st.buf.slice(nl + 1);
        if (line) this.handleLine(sid, line);
      }
    }
  }

  private readRange(path: string, offset: number, length: number): string | undefined {
    let fd: number | undefined;
    try {
      fd = openSync(path, "r");
      const buf = Buffer.alloc(length);
      const read = readSync(fd, buf, 0, length, offset);
      return buf.subarray(0, read).toString("utf8");
    } catch {
      return undefined;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  private handleLine(sid: string, line: string): void {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      return;
    }
    if (o.type === "system" && o.subtype === "api_error") {
      this.errored.add(sid);
      this.emit("error", { sessionId: sid, ...parseApiError(o) } as ApiErrorEvent);
    } else if ((o.type === "assistant" || o.type === "user") && this.errored.has(sid)) {
      // Genuine conversation progress after an error means it recovered.
      this.errored.delete(sid);
      this.emit("recovered", { sessionId: sid });
    }
  }
}

function parseApiError(o: Record<string, unknown>): { status?: number; label: string } {
  const err = o.error;
  let status: number | undefined;
  if (err && typeof err === "object" && "status" in err) {
    status = Number((err as { status: unknown }).status) || undefined;
  } else if (typeof err === "string") {
    const m = err.match(/\b(429|529|500|502|503|504)\b/);
    if (m) status = Number(m[1]);
    else if (/timeout|timed out/i.test(err)) status = -1;
  }

  const word =
    status === 429
      ? "rate limit"
      : status === 529
        ? "overloaded"
        : status === -1
          ? "timeout"
          : status && status >= 500
            ? `err ${status}`
            : "API error";

  const attempt = o.retryAttempt as number | undefined;
  const max = o.maxRetries as number | undefined;
  const retry = attempt && max ? ` ${attempt}/${max}` : "";
  return { status: status && status > 0 ? status : undefined, label: `${word}${retry}` };
}
