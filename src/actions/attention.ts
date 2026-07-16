import {
  action,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { hub } from "../hub";
import { focusTerminal } from "../integrations/terminal";

/**
 * "Take me to who needs me." Dark and calm when every session is happy;
 * pulses yellow (needs input) or red (errored) the moment one isn't. Pressing
 * it jumps iTerm straight to the highest-priority session — the one thing you
 * should look at next. Recommended home: the right-middle key.
 */
@action({ UUID: "com.claudedeck.aikeyboard.attention" })
export class Attention extends SingletonAction {
  private readonly instances = new Map<string, KeyAction>();

  constructor() {
    super();
    hub.on("pins", () => this.repaint());
    hub.on("tick", () => this.repaint());
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    this.instances.set(ev.action.id, ev.action as KeyAction);
    hub.paintAttention(ev.action as KeyAction);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.instances.delete(ev.action.id);
  }

  override onKeyDown(_ev: KeyDownEvent): void {
    const urgent = hub.store.mostUrgent();
    if (urgent) focusTerminal(urgent.term);
  }

  private repaint(): void {
    for (const action of this.instances.values()) hub.paintAttention(action);
  }
}
