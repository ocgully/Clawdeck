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

// Session slots hold no persistent settings — assignment is computed live
// from the slot's position on the deck and the current dashboard page.
type SlotSettings = Record<string, never>;

/**
 * A session-slot key. Place several on the deck and they auto-fill with your
 * live Claude Code sessions, color-coded by status. Pressing one brings that
 * session's iTerm pane to the foreground.
 */
@action({ UUID: "com.claudedeck.aikeyboard.session" })
export class SessionSlot extends SingletonAction<SlotSettings> {
  override onWillAppear(ev: WillAppearEvent<SlotSettings>): void {
    if (ev.action.isKey()) hub.registerSlot(ev.action as KeyAction);
  }

  override onWillDisappear(ev: WillDisappearEvent<SlotSettings>): void {
    hub.unregisterSlot(ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent<SlotSettings>): void {
    if (!ev.action.isKey()) return;
    const info = hub.sessionForSlot(ev.action as KeyAction);
    if (info) focusTerminal(info.term);
  }
}
