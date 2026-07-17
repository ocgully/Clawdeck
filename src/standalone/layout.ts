import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DeckGeometry } from "./device";

/**
 * A key's role. The layout is just an array of these, one per physical key,
 * persisted to ~/.claude/clawdeck/layout.json so users can rearrange the deck
 * by editing a file (a GUI can come later — the file is the source of truth).
 */
export type KeyRole =
  | { kind: "session" }
  | { kind: "pager"; direction: "next" | "prev" }
  | { kind: "attention" }
  | { kind: "monitor"; title: string; command: string; intervalSec: number }
  | { kind: "skills" }
  | { kind: "empty" };

export const LAYOUT_VERSION = 3;

export interface Layout {
  version: number;
  keys: KeyRole[];
}

export function layoutPath(): string {
  return join(homedir(), ".claude", "clawdeck", "layout.json");
}

const monitorsDir = join(homedir(), ".claude", "clawdeck", "monitors");

/**
 * Build a sensible default from the deck's real control positions (not index
 * math — the Neo isn't a dense grid).
 *
 * Tall decks (MK.2 15-key, XL) — no dedicated side buttons:
 *   rightmost column : page-up (top), attention (middle), page-down (bottom)
 *   next column left : Slack monitor (top), Skills (below)
 *   everything else  : sessions
 *
 * Stream Deck Neo (4x2 LCD grid + two RGB-only side buttons):
 *   side buttons     : page-down (left) / page-up (right) — they can only be lit
 *                      a colour, which suits a pager's ambient glow
 *   rightmost column : attention (top), Skills (bottom)
 *   everything else  : sessions (6 slots)
 */
export function defaultLayout(geom: DeckGeometry): Layout {
  const keys: KeyRole[] = Array.from({ length: geom.keyCount }, () => ({ kind: "empty" }));
  const rgbKeys = geom.keys.filter((k) => !k.renderable).sort((a, b) => a.column - b.column);
  const lcdKeys = geom.keys.filter((k) => k.renderable);
  if (!lcdKeys.length) return { version: LAYOUT_VERSION, keys };

  const maxCol = Math.max(...lcdKeys.map((k) => k.column));
  const maxRow = Math.max(...lcdKeys.map((k) => k.row));

  // Prefer dedicated RGB side buttons for paging (Neo).
  const pagersOnSide = rgbKeys.length >= 2;
  if (pagersOnSide) {
    keys[rgbKeys[0]!.index] = { kind: "pager", direction: "prev" };
    keys[rgbKeys[rgbKeys.length - 1]!.index] = { kind: "pager", direction: "next" };
  }

  for (const k of lcdKeys) {
    if (k.column === maxCol) {
      if (pagersOnSide) {
        // Neo: right column is attention + skills.
        if (k.row === 0) keys[k.index] = { kind: "attention" };
        else if (k.row === maxRow) keys[k.index] = { kind: "skills" };
        else keys[k.index] = { kind: "session" };
      } else if (maxRow >= 2) {
        if (k.row === 0) keys[k.index] = { kind: "pager", direction: "next" };
        else if (k.row === maxRow) keys[k.index] = { kind: "pager", direction: "prev" };
        else if (k.row === Math.floor(maxRow / 2)) keys[k.index] = { kind: "attention" };
        else keys[k.index] = { kind: "session" };
      } else {
        keys[k.index] = { kind: "session" };
      }
    } else if (k.column === maxCol - 1 && !pagersOnSide && maxRow >= 2) {
      if (k.row === 0) {
        keys[k.index] = {
          kind: "monitor",
          title: "Slack",
          command: join(monitorsDir, "slack-check.sh"),
          intervalSec: 600,
        };
      } else if (k.row === 1) keys[k.index] = { kind: "skills" };
      else keys[k.index] = { kind: "session" };
    } else {
      keys[k.index] = { kind: "session" };
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
