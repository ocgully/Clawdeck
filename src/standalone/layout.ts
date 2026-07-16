import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DeckGeometry } from "./device";

/**
 * A key's role. The layout is just an array of these, one per physical key,
 * persisted to ~/.claude/claudedeck/layout.json so users can rearrange the deck
 * by editing a file (a GUI can come later — the file is the source of truth).
 */
export type KeyRole =
  | { kind: "session" }
  | { kind: "pager"; direction: "next" | "prev" }
  | { kind: "attention" }
  | { kind: "monitor"; title: string; command: string; intervalSec: number }
  | { kind: "skills" }
  | { kind: "empty" };

export const LAYOUT_VERSION = 2;

export interface Layout {
  version: number;
  keys: KeyRole[];
}

export function layoutPath(): string {
  return join(homedir(), ".claude", "claudedeck", "layout.json");
}

const monitorsDir = join(homedir(), ".claude", "claudedeck", "monitors");

/**
 * Build a sensible default for any geometry:
 *  - rightmost column: page-up (top), attention (middle), page-down (bottom)
 *  - second-from-right column: Slack monitor (top), Skills (below it)
 *  - everything else: session tiles, filled left-to-right, top-to-bottom
 */
export function defaultLayout(geom: DeckGeometry): Layout {
  const { keyCount, columns, rows } = geom;
  const keys: KeyRole[] = [];
  const lastCol = columns - 1;
  const utilCol = columns - 2;
  const midRow = Math.floor((rows - 1) / 2);

  // Utility column, top-down: one Slack monitor, then the Skills key.
  const utilPresets: KeyRole[] = [
    { kind: "monitor", title: "Slack", command: join(monitorsDir, "slack-check.sh"), intervalSec: 600 },
    { kind: "skills" },
  ];
  let utilNext = 0;

  for (let i = 0; i < keyCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    if (col === lastCol) {
      if (row === 0) keys.push({ kind: "pager", direction: "next" });
      else if (row === rows - 1) keys.push({ kind: "pager", direction: "prev" });
      else if (row === midRow) keys.push({ kind: "attention" });
      else keys.push({ kind: "empty" });
    } else if (col === utilCol && utilNext < utilPresets.length) {
      keys.push(utilPresets[utilNext++]!);
    } else {
      keys.push({ kind: "session" });
    }
  }
  return { version: LAYOUT_VERSION, keys };
}

/** Load the saved layout, or generate + persist a default on first run. */
export function loadLayout(geom: DeckGeometry): Layout {
  const path = layoutPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Layout;
      if (parsed?.version === LAYOUT_VERSION && parsed?.keys?.length === geom.keyCount) {
        return parsed;
      }
      // Older version or different deck geometry — regenerate the default.
    } catch {
      /* corrupt file — regenerate */
    }
  }
  const layout = defaultLayout(geom);
  saveLayout(layout);
  return layout;
}

export function saveLayout(layout: Layout): void {
  const path = layoutPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(layout, null, 2) + "\n");
}
