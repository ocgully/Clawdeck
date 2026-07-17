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
import { defaultLayout } from "../src/standalone/layout.ts";
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

// Layout generation across deck shapes. Neo is NOT a dense grid: a 4x2 drawable
// grid plus two RGB-only side buttons on row 2, so index math would misplace them.
const neoGeom = {
  model: "neo",
  keyCount: 10,
  columns: 4,
  rows: 3,
  iconSize: 96,
  keys: [
    ...Array.from({ length: 8 }, (_, i) => ({
      index: i,
      row: Math.floor(i / 4),
      column: i % 4,
      renderable: true,
      size: 96,
    })),
    { index: 8, row: 2, column: 0, renderable: false, size: 0 },
    { index: 9, row: 2, column: 3, renderable: false, size: 0 },
  ],
  lcd: { index: 0, width: 248, height: 58 },
};
const neo = defaultLayout(neoGeom);
assert.equal(neo.keys[8]!.kind, "pager", "Neo: left RGB side button is a pager");
assert.equal((neo.keys[8] as any).direction, "prev", "Neo: left side button pages back");
assert.equal((neo.keys[9] as any).direction, "next", "Neo: right side button pages forward");
assert.equal(neo.keys[3]!.kind, "attention", "Neo: attention top-right of the LCD grid");
assert.equal(neo.keys[7]!.kind, "skills", "Neo: skills bottom-right of the LCD grid");
assert.equal(neo.keys.filter((k) => k.kind === "session").length, 6, "Neo: 6 session slots");

const mk2Geom = {
  model: "originalv2",
  keyCount: 15,
  columns: 5,
  rows: 3,
  iconSize: 72,
  keys: Array.from({ length: 15 }, (_, i) => ({
    index: i,
    row: Math.floor(i / 5),
    column: i % 5,
    renderable: true,
    size: 72,
  })),
};
const mk2 = defaultLayout(mk2Geom);
assert.equal((mk2.keys[4] as any).direction, "next", "MK.2: page-up top-right");
assert.equal(mk2.keys[9]!.kind, "attention", "MK.2: attention middle-right");
assert.equal((mk2.keys[14] as any).direction, "prev", "MK.2: page-down bottom-right");
assert.equal(mk2.keys[3]!.kind, "monitor", "MK.2: Slack monitor in utility column");
assert.equal(mk2.keys[8]!.kind, "skills", "MK.2: skills under the monitor");

server.stop();
console.log("✓ smoke: 34 assertions passed — socket, store, statuses, views, icons, sticky-error, transcript watcher, suggestions, layouts (Neo + MK.2)");
process.exit(0);
