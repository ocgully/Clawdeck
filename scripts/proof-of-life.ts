/**
 * Proof of life: render a full mock ClaudeDeck dashboard onto the physical
 * Stream Deck and respond to key presses. This is the standalone takeover in
 * miniature — no Elgato app involved. Bundled + run via `npm run pol`.
 */
import { listStreamDecks, openStreamDeck } from "@elgato-stream-deck/node";
import {
  sessionTile,
  monitorTile,
  attentionTile,
  pagerTile,
  emptyTile,
} from "../src/icons/render.ts";
import { rasterize, RASTER_FORMAT } from "../src/standalone/raster.ts";
import type { SessionInfo, SessionStatus } from "../src/types.ts";

function mockSession(project: string, status: SessionStatus, agoMs = 0): SessionInfo {
  const now = Date.now();
  return {
    id: project,
    cwd: `/Users/you/git/${project}`,
    project,
    status,
    lastEvent: "mock",
    startedAt: now - agoMs,
    updatedAt: now - agoMs,
    term: {},
  };
}

const urgent = mockSession("webapp", "waiting", 42_000);

// The README layout on a 5x3 deck. Each entry produces one tile face (SVG uri)
// and a role label we echo when the key is pressed.
const layout: { uri: string; role: string }[] = [
  { uri: sessionTile(mockSession("rocket-api", "running", 8000), 0.2), role: "session rocket-api (running)" },
  { uri: sessionTile(urgent, 0.2), role: "session webapp (waiting)" },
  { uri: sessionTile(mockSession("infra", "idle", 300000), 0.2), role: "session infra (idle)" },
  { uri: monitorTile("Slack", "warn", "3 unread"), role: "monitor Slack" },
  { uri: pagerTile("next", "Sessions", 0, 2, "waiting"), role: "pager NEXT" },

  { uri: sessionTile(mockSession("docs", "running", 3000), 0.6), role: "session docs (running)" },
  { uri: sessionTile(mockSession("billing", "error", 15000), 0.2), role: "session billing (error)" },
  { uri: sessionTile(mockSession("auth", "idle", 600000), 0.2), role: "session auth (idle)" },
  { uri: attentionTile(urgent, 0.5), role: "ATTENTION JUMP" },
  { uri: monitorTile("CI", "ok", "passing"), role: "monitor CI" },

  { uri: sessionTile(mockSession("cli", "idle", 120000), 0.2), role: "session cli (idle)" },
  { uri: emptyTile(), role: "empty slot" },
  { uri: sessionTile(mockSession("mobile", "running", 1000), 0.9), role: "session mobile (running)" },
  { uri: monitorTile("Git", "info", "2 dirty"), role: "monitor Git" },
  { uri: pagerTile("prev", "Sessions", 0, 2, "waiting"), role: "pager PREV" },
];

const decks = await listStreamDecks();
if (!decks.length) {
  console.error("No Stream Deck found. Is it plugged in and the Elgato app quit?");
  process.exit(1);
}

const sd = await openStreamDeck(decks[0]!.path);
const size = 72; // originalv2 key size
await sd.setBrightness(85);
await sd.clearPanel();

// Render every tile.
const buffers: Buffer[] = [];
for (let i = 0; i < layout.length; i++) {
  const buf = await rasterize(layout[i]!.uri, size);
  buffers[i] = buf;
  await sd.fillKeyBuffer(i, buf, { format: RASTER_FORMAT });
}
console.log(`✓ Rendered ${layout.length} tiles to your Stream Deck — look at it now!`);
console.log("Press any key on the deck; Ctrl-C to exit (images stay on the hardware).");

// Input loop: log the pressed role and flash the key white briefly.
sd.on("down", async (control: unknown) => {
  const index = typeof control === "number" ? control : (control as { index: number }).index;
  const entry = layout[index];
  console.log(`▶ pressed key ${index}: ${entry?.role ?? "unknown"}`);
  try {
    await sd.fillKeyColor(index, 255, 255, 255);
    setTimeout(() => {
      const b = buffers[index];
      if (b) void sd.fillKeyBuffer(index, b, { format: RASTER_FORMAT });
    }, 160);
  } catch {
    /* ignore transient */
  }
});

const shutdown = async () => {
  try {
    await sd.close();
  } catch {}
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
