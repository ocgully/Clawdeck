import streamDeck from "@elgato/streamdeck";
import { hub } from "./hub";
import { HookSocketServer } from "./ipc/socket-server";
import { SessionSlot } from "./actions/session-slot";
import { Pager } from "./actions/pager";
import { Attention } from "./actions/attention";
import { Monitor } from "./actions/monitor";

const logger = streamDeck.logger.createScope("ClaudeDeck");
streamDeck.logger.setLevel("info");

// Register the four key types.
streamDeck.actions.registerAction(new SessionSlot());
streamDeck.actions.registerAction(new Pager());
streamDeck.actions.registerAction(new Attention());
streamDeck.actions.registerAction(new Monitor());

// The plugin backend doubles as the daemon: Claude Code hooks stream session
// lifecycle events into this socket, which feeds the shared session store.
const server = new HookSocketServer();
server.on("message", (msg) => hub.store.apply(msg));
server.on("listening", (path) => logger.info(`Hook socket listening at ${path}`));
server.on("error", (err) => logger.error(`Hook socket error: ${err.message}`));
server.start();

process.on("exit", () => server.stop());
process.on("SIGTERM", () => server.stop());

streamDeck.connect();
