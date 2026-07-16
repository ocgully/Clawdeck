import { EventEmitter } from "node:events";
import type { KeyAction } from "@elgato/streamdeck";
import { SessionStore } from "./state/session-store";
import { ViewState } from "./state/views";
import {
  emptyTile,
  pagerTile,
  sessionTile,
  attentionTile,
} from "./icons/render";
import type { SessionInfo } from "./types";

/**
 * The single long-lived coordinator. It holds the session store and view
 * state, owns the animation clock, and knows how to lay live sessions out
 * across the session-slot keys currently on the deck.
 *
 * Actions register the KeyAction instances they own here; the hub decides
 * what each one should display so paging and ordering stay globally coherent.
 */
class Hub extends EventEmitter {
  readonly store = new SessionStore();
  readonly views = new ViewState();

  /** Visible session-slot keys, keyed by action id. Ordered by deck position. */
  private slots = new Map<string, KeyAction>();

  private tickPhase = 0;
  private ticking = false;

  constructor() {
    super();
    this.store.on("change", () => this.onStateChange());
    this.views.on("change", () => this.redrawSlots());
    // ~7fps animation clock — smooth enough for spinners, gentle on CPU.
    setInterval(() => this.tick(), 140).unref();
  }

  private onStateChange(): void {
    this.views.reflow(this.liveSessions().length);
    this.redrawSlots();
    this.emit("pins"); // pagers + attention redraw
  }

  registerSlot(action: KeyAction): void {
    this.slots.set(action.id, action);
    this.views.slotCount = this.slots.size;
    this.onStateChange();
  }

  unregisterSlot(id: string): void {
    this.slots.delete(id);
    this.views.slotCount = this.slots.size;
    this.onStateChange();
  }

  /** Live = everything except fully ended sessions, newest first. */
  liveSessions(): SessionInfo[] {
    return this.store.list().filter((s) => s.status !== "ended");
  }

  /**
   * Assign sessions to slots for the active view/page and paint each one.
   * When `animatedOnly` is set (the animation clock), we skip static tiles and
   * only repaint running ones — keeping the spinner alive without flooding the
   * Stream Deck with redundant setImage calls.
   */
  redrawSlots(animatedOnly = false): void {
    const ordered = [...this.slots.values()].sort(byDeckPosition);
    const sessions = this.liveSessions();
    const offset = this.views.current().page * ordered.length;

    ordered.forEach((action, i) => {
      const info = sessions[offset + i];
      if (animatedOnly && info?.status !== "running") return;
      void action.setImage(info ? sessionTile(info, this.tickPhase) : emptyTile());
    });
  }

  sessionForSlot(action: KeyAction): SessionInfo | undefined {
    const ordered = [...this.slots.values()].sort(byDeckPosition);
    const i = ordered.findIndex((a) => a.id === action.id);
    if (i < 0) return undefined;
    const offset = this.views.current().page * ordered.length;
    return this.liveSessions()[offset + i];
  }

  paintPager(action: KeyAction, direction: "next" | "prev"): void {
    void action.setImage(
      pagerTile(
        direction,
        this.views.current().label,
        this.views.currentIndex(),
        this.views.count(),
        this.store.peakStatus(),
      ),
    );
  }

  paintAttention(action: KeyAction): void {
    void action.setImage(
      attentionTile(this.store.mostUrgent(), this.tickPhase),
    );
  }

  private tick(): void {
    const running = this.liveSessions().some((s) => s.status === "running");
    const urgent = this.store.mostUrgent();
    if (!running && !urgent) {
      this.ticking = false;
      return;
    }
    this.ticking = true;
    this.tickPhase = (this.tickPhase + 0.06) % 1;
    if (running) this.redrawSlots(true);
    this.emit("tick");
  }

  get phase(): number {
    return this.tickPhase;
  }

  get animating(): boolean {
    return this.ticking;
  }
}

function byDeckPosition(a: KeyAction, b: KeyAction): number {
  const ac = a.coordinates;
  const bc = b.coordinates;
  if (!ac || !bc) return 0;
  return ac.row - bc.row || ac.column - bc.column;
}

export const hub = new Hub();
