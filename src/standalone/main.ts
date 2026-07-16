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

  // Claude Code hooks stream session events into this socket.
  const server = new HookSocketServer();
  server.on("message", (msg) => store.apply(msg));
  server.on("listening", (path) => console.log(`ClaudeDeck: listening for hooks at ${path}`));
  server.on("error", (err) => console.error(`ClaudeDeck: socket error: ${err.message}`));
  server.start();

  console.log(`ClaudeDeck: running. Socket: ${socketPath()}`);
  console.log("Press Ctrl-C to stop (the deck keeps its last frame).");

  const shutdown = async () => {
    monitors.stop();
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
