import {
  listStreamDecks,
  openStreamDeck,
  type StreamDeck,
} from "@elgato-stream-deck/node";
import { rasterize, RASTER_FORMAT } from "./raster";

/**
 * Thin wrapper over @elgato-stream-deck/node that speaks in our terms: render a
 * key from an SVG data-URI, listen for presses by index, and expose the real
 * control geometry. This is the only module that touches the HID library.
 *
 * Geometry comes from the device's own CONTROLS rather than index math, because
 * not every deck is a dense grid. The Stream Deck Neo, for example, is a 4x2
 * LCD grid PLUS two RGB-only side buttons (indices 8/9 on row 2) that can be lit
 * a colour but cannot display an image, PLUS an LCD info bar between them.
 */
export interface DeckKey {
  index: number;
  row: number;
  column: number;
  /** false for RGB-only keys (Neo's side buttons): colour fill only, no image. */
  renderable: boolean;
  /** Pixel size of a renderable key (0 when RGB-only). */
  size: number;
}

export interface DeckGeometry {
  model: string;
  keyCount: number;
  columns: number;
  rows: number;
  /** Size of the renderable keys. */
  iconSize: number;
  keys: DeckKey[];
  /** Present on decks with an LCD strip (Neo's info bar). */
  lcd?: { index: number; width: number; height: number };
}

export class Deck {
  private sd?: StreamDeck;
  private geom: DeckGeometry = {
    model: "unknown",
    keyCount: 0,
    columns: 0,
    rows: 0,
    iconSize: 72,
    keys: [],
  };

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
    const keys: DeckKey[] = buttons.map((b) => {
      const size = (b as { pixelSize?: { width: number } }).pixelSize?.width ?? 0;
      return { index: b.index, row: b.row, column: b.column, renderable: size > 0, size };
    });

    const lcdSeg = sd.CONTROLS.find((c) => c.type === "lcd-segment") as
      | { id: number; pixelSize: { width: number; height: number } }
      | undefined;

    this.geom = {
      model: String(sd.MODEL),
      keyCount: keys.length,
      columns: Math.max(...keys.map((k) => k.column)) + 1,
      rows: Math.max(...keys.map((k) => k.row)) + 1,
      iconSize: keys.find((k) => k.renderable)?.size ?? 72,
      keys,
      lcd: lcdSeg
        ? { index: lcdSeg.id, width: lcdSeg.pixelSize.width, height: lcdSeg.pixelSize.height }
        : undefined,
    };

    sd.on("error", (err) => process.stderr.write(`[clawdeck] deck error: ${err}\n`));
    return this.geom;
  }

  geometry(): DeckGeometry {
    return this.geom;
  }

  key(index: number): DeckKey | undefined {
    return this.geom.keys.find((k) => k.index === index);
  }

  isRenderable(index: number): boolean {
    return this.key(index)?.renderable ?? false;
  }

  async setBrightness(percent: number): Promise<void> {
    await this.sd?.setBrightness(Math.max(0, Math.min(100, percent)));
  }

  /** Render an SVG data-URI onto a key. No-op for RGB-only keys. */
  async renderKey(index: number, dataUri: string): Promise<void> {
    if (!this.sd || !this.isRenderable(index)) return;
    const buf = await rasterize(dataUri, this.geom.iconSize);
    await this.sd.fillKeyBuffer(index, buf, { format: RASTER_FORMAT });
  }

  async fillColor(index: number, r: number, g: number, b: number): Promise<void> {
    await this.sd?.fillKeyColor(index, r, g, b);
  }

  /** Render an SVG data-URI onto the LCD info bar (Neo). */
  async renderLcd(dataUri: string): Promise<void> {
    const lcd = this.geom.lcd;
    if (!this.sd || !lcd) return;
    const buf = await rasterize(dataUri, lcd.width, lcd.height);
    await this.sd.fillLcd(lcd.index, buf, { format: RASTER_FORMAT });
  }

  async clearKey(index: number): Promise<void> {
    if (this.isRenderable(index)) await this.sd?.clearKey(index);
    else await this.sd?.fillKeyColor(index, 0, 0, 0);
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
