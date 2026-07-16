import {
  listStreamDecks,
  openStreamDeck,
  type StreamDeck,
} from "@elgato-stream-deck/node";
import { rasterize, RASTER_FORMAT } from "./raster";

/**
 * Thin wrapper over @elgato-stream-deck/node that speaks in our terms: render a
 * key from an SVG data-URI, listen for presses by index, and expose the grid
 * geometry. This is the only module that touches the HID library, so the rest
 * of the daemon stays driver-agnostic.
 */
export interface DeckGeometry {
  keyCount: number;
  columns: number;
  rows: number;
  iconSize: number;
}

export class Deck {
  private sd?: StreamDeck;
  private geom: DeckGeometry = { keyCount: 0, columns: 0, rows: 0, iconSize: 72 };

  async open(): Promise<DeckGeometry> {
    const decks = await listStreamDecks();
    if (!decks.length) {
      throw new Error(
        "No Stream Deck found. Plug it in and make sure the Elgato app isn't running.",
      );
    }
    const sd = await openStreamDeck(decks[0]!.path);
    this.sd = sd;

    const buttons = sd.CONTROLS.filter((c) => c.type === "button");
    const columns = Math.max(...buttons.map((b) => b.column)) + 1;
    const rows = Math.max(...buttons.map((b) => b.row)) + 1;
    const iconSize = buttons[0]?.pixelSize.width ?? 72;
    this.geom = { keyCount: buttons.length, columns, rows, iconSize };

    sd.on("error", (err) => process.stderr.write(`[claudedeck] deck error: ${err}\n`));
    return this.geom;
  }

  geometry(): DeckGeometry {
    return this.geom;
  }

  async setBrightness(percent: number): Promise<void> {
    await this.sd?.setBrightness(Math.max(0, Math.min(100, percent)));
  }

  /** Render an SVG data-URI onto a key. */
  async renderKey(index: number, dataUri: string): Promise<void> {
    if (!this.sd) return;
    const buf = await rasterize(dataUri, this.geom.iconSize);
    await this.sd.fillKeyBuffer(index, buf, { format: RASTER_FORMAT });
  }

  async fillColor(index: number, r: number, g: number, b: number): Promise<void> {
    await this.sd?.fillKeyColor(index, r, g, b);
  }

  async clearKey(index: number): Promise<void> {
    await this.sd?.clearKey(index);
  }

  async clearAll(): Promise<void> {
    await this.sd?.clearPanel();
  }

  onPress(cb: (index: number) => void): void {
    this.sd?.on("down", (control) => cb(indexOf(control)));
  }

  onRelease(cb: (index: number) => void): void {
    this.sd?.on("up", (control) => cb(indexOf(control)));
  }

  async close(): Promise<void> {
    try {
      await this.sd?.close();
    } catch {
      /* ignore */
    }
    this.sd = undefined;
  }
}

/** v7 emits a control object for key events; older shapes pass a bare index. */
function indexOf(control: unknown): number {
  if (typeof control === "number") return control;
  return (control as { index: number }).index;
}
