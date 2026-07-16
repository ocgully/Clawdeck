import { EventEmitter } from "node:events";

/**
 * The "virtual displays" the top-right / bottom-right buttons cycle through.
 * A view is just a label plus a page offset into the session list. The pager
 * walks this ring; session-slot tiles render whatever the active view points at.
 *
 * View 0 is always the primary dashboard. When there are more live sessions
 * than slots, the store appends overflow pages on the fly so nothing is hidden.
 */
export interface View {
  id: string;
  label: string;
  /** Which slice of the session list this view shows (page * slotCount). */
  page: number;
}

export class ViewState extends EventEmitter {
  private views: View[] = [{ id: "dashboard", label: "Sessions", page: 0 }];
  private index = 0;

  /** How many session-slot keys are currently on the deck. Set by the plugin. */
  slotCount = 0;

  current(): View {
    return this.views[this.index] ?? this.views[0]!;
  }

  currentIndex(): number {
    return this.index;
  }

  count(): number {
    return this.views.length;
  }

  cycle(direction: 1 | -1): void {
    const n = this.views.length;
    this.index = (this.index + direction + n) % n;
    this.emit("change");
  }

  jumpTo(index: number): void {
    if (index < 0 || index >= this.views.length) return;
    this.index = index;
    this.emit("change");
  }

  /**
   * Recompute overflow pages so every session is reachable. Keeps the primary
   * dashboard as view 0 and clamps the active index if pages shrink.
   */
  reflow(sessionCount: number): void {
    const slots = Math.max(1, this.slotCount);
    const pages = Math.max(1, Math.ceil(sessionCount / slots));
    const next: View[] = [];
    for (let p = 0; p < pages; p++) {
      next.push({
        id: p === 0 ? "dashboard" : `page-${p}`,
        label: p === 0 ? "Sessions" : `Sessions ${p + 1}`,
        page: p,
      });
    }
    const before = this.views.length;
    this.views = next;
    if (this.index >= next.length) this.index = next.length - 1;
    if (before !== next.length) this.emit("change");
  }
}
