/**
 * Runtime smoke test for the pieces that don't need the physical deck:
 * hook JSON -> unix socket -> session store -> status mapping -> icon render.
 * Run: node --experimental-strip-types scripts/smoke.ts
 */
import net from "node:net";
import assert from "node:assert";
import { HookSocketServer, socketPath } from "../src/ipc/socket-server.ts";
import { SessionStore } from "../src/state/session-store.ts";
import { ViewState } from "../src/state/views.ts";
import { sessionTile, attentionTile, monitorTile } from "../src/icons/render.ts";
import type { HookMessage } from "../src/types.ts";
import { TranscriptWatcher } from "../src/standalone/transcript-watcher.ts";
import { parseSuggestions, QUICK_ACTIONS } from "../src/standalone/suggestions.ts";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const store = new SessionStore();
const server = new HookSocketServer();
server.on("message", (m: HookMessage) => store.apply(m));

function send(msg: Partial<HookMessage>): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = net.connect(socketPath(), () => {
      c.write(JSON.stringify({ type: "event", ts: Date.now(), ...msg }) + "\n", () => {
        c.end();
        resolve();
      });
    });
    c.on("error", reject);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

await new Promise<void>((resolve) => {
  server.on("listening", () => resolve());
  server.start();
});

// Three sessions in different states.
await send({ event: "SessionStart", session_id: "a", cwd: "/Users/me/git/rocket-api" });
await send({ event: "UserPromptSubmit", session_id: "b", cwd: "/Users/me/git/webapp" });
await send({ event: "SessionStart", session_id: "c", cwd: "/Users/me/git/infra" });
await send({ event: "Notification", session_id: "c", cwd: "/Users/me/git/infra", note: "Allow edit?" });
await wait(50);

const list = store.list();
assert.equal(list.length, 3, "should track 3 sessions");
assert.equal(store.get("a")!.status, "idle", "a idle");
assert.equal(store.get("b")!.status, "running", "b running");
assert.equal(store.get("c")!.status, "waiting", "c waiting");
assert.equal(store.get("a")!.project, "rocket-api", "project name from cwd");

// Urgency + ambient peak.
assert.equal(store.mostUrgent()!.id, "c", "waiting session is most urgent");
assert.equal(store.peakStatus(), "waiting", "peak status is waiting");

// b finishes -> idle; error arrives on a.
await send({ event: "Stop", session_id: "b", cwd: "/Users/me/git/webapp" });
await send({ event: "PostToolUse", session_id: "a", cwd: "/Users/me/git/rocket-api", exit_code: 1 });
await wait(50);
assert.equal(store.get("b")!.status, "idle", "b returned to idle");
assert.equal(store.get("a")!.status, "error", "a errored via non-zero exit");
assert.equal(store.mostUrgent()!.id, "c", "waiting still outranks error");

// View reflow: 2 slots, 3 sessions -> 2 pages.
const views = new ViewState();
views.slotCount = 2;
views.reflow(store.list().filter((s) => s.status !== "ended").length);
assert.equal(views.count(), 2, "3 sessions across 2 slots -> 2 pages");
views.cycle(1);
assert.equal(views.currentIndex(), 1, "cycle advances page");
views.cycle(1);
assert.equal(views.currentIndex(), 0, "cycle wraps around");

// Icons render to valid data URIs.
for (const uri of [
  sessionTile(store.get("c")!, 0.3),
  attentionTile(store.mostUrgent(), 0.5),
  monitorTile("Slack", "warn", "3 unread"),
]) {
  assert.ok(uri.startsWith("data:image/svg+xml;base64,"), "valid data uri");
  const svg = Buffer.from(uri.split(",")[1]!, "base64").toString("utf8");
  assert.ok(svg.includes("<svg") && svg.includes("</svg>"), "well-formed svg");
}

// Sticky error: an ApiError stays red through a turn-end (Stop), clears on a
// new prompt.
await send({ event: "ApiError", session_id: "b", note: "rate limit 3/10" });
await wait(30);
assert.equal(store.get("b")!.status, "error", "ApiError sets red");
assert.equal(store.get("b")!.note, "rate limit 3/10", "error note surfaced");
await send({ event: "Stop", session_id: "b" });
await wait(30);
assert.equal(store.get("b")!.status, "error", "Stop does not clear a real error (sticky)");
await send({ event: "UserPromptSubmit", session_id: "b" });
await wait(30);
assert.equal(store.get("b")!.status, "running", "new prompt clears the error");

// Transcript watcher: api_error line -> 'error', later assistant line -> 'recovered'.
const tdir = mkdtempSync(join(tmpdir(), "cd-tw-"));
const tpath = join(tdir, "session.jsonl");
writeFileSync(tpath, "");
const tw = new TranscriptWatcher();
let errEvt: any, recEvt: any;
tw.on("error", (e: any) => (errEvt = e));
tw.on("recovered", (e: any) => (recEvt = e));
tw.track("sess-x", tpath);

appendFileSync(
  tpath,
  JSON.stringify({ type: "system", subtype: "api_error", error: { status: 429 }, retryAttempt: 3, maxRetries: 10 }) + "\n",
);
tw.poll();
assert.equal(errEvt?.sessionId, "sess-x", "watcher emits error for api_error line");
assert.equal(errEvt?.label, "rate limit 3/10", "watcher labels 429 with retry count");

appendFileSync(tpath, JSON.stringify({ type: "assistant", message: {} }) + "\n");
tw.poll();
assert.equal(recEvt?.sessionId, "sess-x", "watcher emits recovered on progress after error");
tw.stop();

// Suggestions: parse bullets + a question from the last assistant message,
// skipping a trailing tool-only message (as real transcripts have).
const spath = join(tdir, "conv.jsonl");
writeFileSync(
  spath,
  [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Here's the plan.\n1. Add the missing tests\n2. Refactor the parser\nShould I start with the tests?" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "x" }] } }),
  ].join("\n") + "\n",
);
const suggestions = parseSuggestions(spath);
assert.ok(suggestions.length >= 2, "parses suggestions from last text message, skipping tool-only");
assert.ok(
  suggestions.some((s) => /tests/i.test(s.text)) && suggestions.some((s) => s.text.endsWith("?")),
  "captures both a bullet option and the question",
);
assert.ok(suggestions.every((s) => s.kind === "suggestion"), "suggestions tagged correctly");
assert.equal(QUICK_ACTIONS[0]!.text, "continue", "quick actions available as a reliable baseline");

server.stop();
console.log("✓ smoke: 23 assertions passed — socket, store, statuses, views, icons, sticky-error, transcript watcher, suggestions");
process.exit(0);
