/**
 * ClaudeDeck standalone daemon. Owns the Stream Deck over USB HID (no Elgato
 * app), receives Claude Code session events over a unix socket, and drives the
 * physical keys. This is the whole product entry point.
 */
import { SessionStore } from "../state/session-store";
import { ViewState } from "../state/views";
import { HookSocketServer, socketPath } from "../ipc/socket-server";
import { Deck } from "./device";
import { loadLayout } from "./layout";
import { MonitorRunner } from "./monitor-runner";
import { Controller } from "./controller";
import { checkInputMonitoring, inputMonitoringHelp } from "./permissions";
import { seedDemo } from "./demo";
import { TranscriptWatcher, type ApiErrorEvent } from "./transcript-watcher";

async function main(): Promise<void> {
  const deck = new Deck();
  const geom = await deck.open();
  console.log(
    `ClaudeDeck: opened ${geom.keyCount}-key deck (${geom.columns}x${geom.rows}, ${geom.iconSize}px)`,
  );

  // Preflight: warn (and prompt) if macOS won't deliver button presses yet.
  const perm = checkInputMonitoring(true);
  if (!perm.authorized) {
    console.warn(`ClaudeDeck: Input Monitoring not granted (status: ${perm.status}).`);
    console.warn(inputMonitoringHelp());
  }

  const store = new SessionStore();
  const views = new ViewState();
  const monitors = new MonitorRunner();
  const layout = loadLayout(geom);

  const controller = new Controller(deck, store, views, monitors, layout);
  await controller.start();

  if (process.env.CLAUDEDECK_DEMO) {
    seedDemo(store);
    console.log("ClaudeDeck: demo mode — seeded fake sessions (2 pages, 1 waiting, 2 errored).");
  }

  // Tail transcripts for in-session API errors (red) — the one status hooks
  // can't give us. Sessions are tracked as their hook events reveal the path.
  const transcripts = new TranscriptWatcher();
  transcripts.on("error", (e: ApiErrorEvent) =>
    store.apply({ type: "event", event: "ApiError", session_id: e.sessionId, note: e.label, ts: Date.now() }),
  );
  transcripts.on("recovered", (e: { sessionId: string }) =>
    store.apply({ type: "event", event: "ApiRecovered", session_id: e.sessionId, ts: Date.now() }),
  );
  transcripts.start();
  store.on("change", () => transcripts.retainOnly(new Set(store.list().map((s) => s.id))));

  // Claude Code hooks stream session events into this socket.
  const server = new HookSocketServer();
  server.on("message", (msg) => {
    store.apply(msg);
    if (msg.transcript_path) transcripts.track(msg.session_id, msg.transcript_path);
  });
  server.on("listening", (path) => console.log(`ClaudeDeck: listening for hooks at ${path}`));
  server.on("error", (err) => console.error(`ClaudeDeck: socket error: ${err.message}`));
  server.start();

  console.log(`ClaudeDeck: running. Socket: ${socketPath()}`);
  console.log("Press Ctrl-C to stop (the deck keeps its last frame).");

  const shutdown = async () => {
    monitors.stop();
    transcripts.stop();
    server.stop();
    await deck.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`ClaudeDeck failed to start: ${err.message}`);
  process.exit(1);
});
