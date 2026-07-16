import { SessionStore } from "../state/session-store";
import { ViewState } from "../state/views";
import {
  sessionTile,
  emptyTile,
  pagerTile,
  attentionTile,
  monitorTile,
  type MonitorLevel,
} from "../icons/render";
import { focusTerminal } from "../integrations/terminal";
import type { Deck } from "./device";
import type { KeyRole, Layout } from "./layout";
import { MonitorRunner, type MonitorResult } from "./monitor-runner";

/**
 * The daemon's brain. Owns session + view state, drives the monitor loops, and
 * maps everything onto the physical keys per the layout. Renders reactively:
 * a hook event, a view change, a monitor result, or the animation clock each
 * repaint exactly the keys that changed.
 */
export class Controller {
  private monitorState = new Map<number, MonitorResult>();
  private sessionSlots: number[] = []; // key indices with role "session", in order
  private tickPhase = 0;

  constructor(
    private readonly deck: Deck,
    readonly store: SessionStore,
    readonly views: ViewState,
    private readonly monitors: MonitorRunner,
    private readonly layout: Layout,
  ) {}

  async start(): Promise<void> {
    await this.deck.setBrightness(85);
    await this.deck.clearAll();

    // Which keys are session slots, and how many.
    this.sessionSlots = this.layout.keys
      .map((role, i) => (role.kind === "session" ? i : -1))
      .filter((i) => i >= 0);
    this.views.slotCount = this.sessionSlots.length;

    // Wire monitors.
    const specs = this.layout.keys
      .map((role, index) => ({ role, index }))
      .filter((x): x is { role: Extract<KeyRole, { kind: "monitor" }>; index: number } => x.role.kind === "monitor")
      .map(({ role, index }) => ({ index, title: role.title, command: role.command, intervalSec: role.intervalSec }));
    this.monitors.on("result", (r: MonitorResult) => {
      this.monitorState.set(r.index, r);
      void this.renderKey(r.index);
    });
    this.monitors.configure(specs);

    // Reactive redraws.
    this.store.on("change", () => {
      this.views.reflow(this.liveSessions().length);
      void this.renderSessions();
      void this.renderPins();
    });
    this.views.on("change", () => {
      void this.renderSessions();
      void this.renderPins();
    });

    // Presses.
    this.deck.onPress((index) => this.onPress(index));

    // Animation clock (~7fps): spinners on running sessions, attention pulse.
    setInterval(() => this.tick(), 140).unref();

    await this.renderAll();
  }

  private liveSessions() {
    return this.store.list().filter((s) => s.status !== "ended");
  }

  private async renderAll(): Promise<void> {
    this.views.reflow(this.liveSessions().length);
    for (let i = 0; i < this.layout.keys.length; i++) await this.renderKey(i);
  }

  private async renderSessions(): Promise<void> {
    for (const index of this.sessionSlots) await this.renderKey(index);
  }

  private async renderPins(): Promise<void> {
    for (let i = 0; i < this.layout.keys.length; i++) {
      const role = this.layout.keys[i]!;
      if (role.kind === "pager" || role.kind === "attention") await this.renderKey(i);
    }
  }

  private async renderKey(index: number): Promise<void> {
    const role = this.layout.keys[index];
    if (!role) return;
    const uri = this.faceFor(role, index);
    if (uri) await this.deck.renderKey(index, uri);
    else await this.deck.clearKey(index);
  }

  private faceFor(role: KeyRole, index: number): string | undefined {
    switch (role.kind) {
      case "session": {
        const slotPos = this.sessionSlots.indexOf(index);
        const offset = this.views.current().page * this.sessionSlots.length;
        const info = this.liveSessions()[offset + slotPos];
        return info ? sessionTile(info, this.tickPhase) : emptyTile();
      }
      case "pager":
        return pagerTile(
          role.direction,
          this.views.current().label,
          this.views.currentIndex(),
          this.views.count(),
          this.store.peakStatus(),
        );
      case "attention":
        return attentionTile(this.store.mostUrgent(), this.tickPhase);
      case "monitor": {
        const r = this.monitorState.get(index);
        return monitorTile(role.title, (r?.level ?? "info") as MonitorLevel, r?.caption ?? "…", this.tickPhase);
      }
      case "empty":
        return emptyTile();
    }
  }

  private onPress(index: number): void {
    const role = this.layout.keys[index];
    if (!role) return;
    // Unmistakable feedback: log it and flash the key, so a press is visible
    // even when there's no state for it to act on yet.
    console.log(`▶ press: key ${index} (${role.kind})`);
    void this.flash(index);
    switch (role.kind) {
      case "session": {
        const slotPos = this.sessionSlots.indexOf(index);
        const offset = this.views.current().page * this.sessionSlots.length;
        const info = this.liveSessions()[offset + slotPos];
        if (info) focusTerminal(info.term);
        break;
      }
      case "pager":
        this.views.cycle(role.direction === "next" ? 1 : -1);
        break;
      case "attention": {
        const urgent = this.store.mostUrgent();
        if (urgent) focusTerminal(urgent.term);
        break;
      }
      case "monitor": {
        const specs = this.layout.keys
          .map((r, i) => ({ r, i }))
          .filter((x) => x.r.kind === "monitor")
          .map((x) => {
            const m = x.r as Extract<KeyRole, { kind: "monitor" }>;
            return { index: x.i, title: m.title, command: m.command, intervalSec: m.intervalSec };
          });
        this.monitors.runByIndex(specs, index);
        break;
      }
      case "empty":
        break;
    }
  }

  /** Briefly flash a key white, then repaint its real face — press feedback. */
  private async flash(index: number): Promise<void> {
    try {
      await this.deck.fillColor(index, 255, 255, 255);
      setTimeout(() => void this.renderKey(index), 150);
    } catch {
      /* ignore transient render errors */
    }
  }

  private tick(): void {
    const running = this.liveSessions().some((s) => s.status === "running");
    const urgent = this.store.mostUrgent();
    const monitorRunning = [...this.monitorState.values()].some((r) => r.running);
    if (!running && !urgent && !monitorRunning) return;

    this.tickPhase = (this.tickPhase + 0.06) % 1;

    // Repaint only the animated keys.
    for (const index of this.sessionSlots) {
      const slotPos = this.sessionSlots.indexOf(index);
      const offset = this.views.current().page * this.sessionSlots.length;
      if (this.liveSessions()[offset + slotPos]?.status === "running") void this.renderKey(index);
    }
    for (let i = 0; i < this.layout.keys.length; i++) {
      const role = this.layout.keys[i]!;
      if (role.kind === "attention" && urgent) void this.renderKey(i);
      if (role.kind === "monitor" && this.monitorState.get(i)?.running) void this.renderKey(i);
    }
  }
}
