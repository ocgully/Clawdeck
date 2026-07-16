import {
  action,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { hub } from "../hub";

interface PagerSettings {
  /** "next" (default, top-right) or "prev" (bottom-right). */
  direction?: "next" | "prev";
}

/**
 * The virtual-display pager. Two of these — top-right (next) and bottom-right
 * (prev) — cycle through the dashboard's pages. They also carry the ambient
 * glow: their border takes on the color of your most urgent session, so status
 * reaches you from peripheral vision even while you're not looking at the deck.
 */
@action({ UUID: "com.claudedeck.aikeyboard.pager" })
export class Pager extends SingletonAction<PagerSettings> {
  private readonly instances = new Map<string, { action: KeyAction; direction: "next" | "prev" }>();

  constructor() {
    super();
    hub.on("pins", () => this.repaint());
    hub.on("tick", () => this.repaint());
  }

  override async onWillAppear(ev: WillAppearEvent<PagerSettings>): Promise<void> {
    if (!ev.action.isKey()) return;
    const direction = (await ev.action.getSettings()).direction ?? "next";
    this.instances.set(ev.action.id, { action: ev.action as KeyAction, direction });
    hub.paintPager(ev.action as KeyAction, direction);
  }

  override onWillDisappear(ev: WillDisappearEvent<PagerSettings>): void {
    this.instances.delete(ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent<PagerSettings>): void {
    const direction = this.instances.get(ev.action.id)?.direction ?? "next";
    hub.views.cycle(direction === "next" ? 1 : -1);
    this.repaint();
  }

  private repaint(): void {
    for (const { action, direction } of this.instances.values()) {
      hub.paintPager(action, direction);
    }
  }
}
