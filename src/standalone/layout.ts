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
  | { kind: "empty" };

export interface Layout {
  version: 1;
  keys: KeyRole[];
}

export function layoutPath(): string {
  return join(homedir(), ".claude", "claudedeck", "layout.json");
}

const monitorsDir = join(homedir(), ".claude", "claudedeck", "monitors");

/**
 * Build a sensible default for any geometry:
 *  - rightmost column: page-next (top), attention (middle), page-prev (bottom)
 *  - second-from-right column: monitor loops
 *  - everything else: session tiles, filled left-to-right, top-to-bottom
 */
export function defaultLayout(geom: DeckGeometry): Layout {
  const { keyCount, columns, rows } = geom;
  const keys: KeyRole[] = [];
  const lastCol = columns - 1;
  const monCol = columns - 2;
  const midRow = Math.floor((rows - 1) / 2);

  const monitorPresets: KeyRole[] = [
    { kind: "monitor", title: "Slack", command: join(monitorsDir, "slack-check.sh"), intervalSec: 600 },
    { kind: "monitor", title: "CI", command: join(monitorsDir, "ci-status.sh"), intervalSec: 300 },
    { kind: "monitor", title: "Git", command: "git -C \"$PWD\" status --porcelain | wc -l | awk '{print \"LABEL: \"$1\" dirty\"}'", intervalSec: 120 },
  ];
  let monNext = 0;

  for (let i = 0; i < keyCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    if (col === lastCol) {
      if (row === 0) keys.push({ kind: "pager", direction: "next" });
      else if (row === rows - 1) keys.push({ kind: "pager", direction: "prev" });
      else if (row === midRow) keys.push({ kind: "attention" });
      else keys.push({ kind: "empty" });
    } else if (col === monCol && monNext < monitorPresets.length) {
      keys.push(monitorPresets[monNext++]!);
    } else {
      keys.push({ kind: "session" });
    }
  }
  return { version: 1, keys };
}

/** Load the saved layout, or generate + persist a default on first run. */
export function loadLayout(geom: DeckGeometry): Layout {
  const path = layoutPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Layout;
      if (parsed?.keys?.length === geom.keyCount) return parsed;
      // Geometry changed (different deck) — fall through and regenerate.
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
