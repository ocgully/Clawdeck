import { SessionStore } from "../state/session-store";
import { ViewState } from "../state/views";
import {
  sessionTile,
  emptyTile,
  pagerTile,
  attentionTile,
  monitorTile,
  skillsTile,
  actionTile,
  backTile,
  moreTile,
  type MonitorLevel,
} from "../icons/render";
import { focusTerminal, sendText } from "../integrations/terminal";
import type { Deck, DeckGeometry } from "./device";
import type { KeyRole, Layout } from "./layout";
import { MonitorRunner, type MonitorResult } from "./monitor-runner";
import { discoverSkills, recordSkillUse } from "./skills";
import { QUICK_ACTIONS, parseSuggestions, type ActionItem } from "./suggestions";
import type { SessionInfo } from "../types";

const DOUBLE_TAP_MS = 400;

/**
 * The daemon's brain. Two modes:
 *  - "dashboard": the live grid of sessions, monitors, pagers, attention, skills.
 *  - "context":   drill into one session — quick actions, parsed suggestions, and
 *                 usage-ranked skills you can 1-shot run, with a Back key.
 * Double-tapping a session tile focuses it and opens its context view.
 */
export class Controller {
  private monitorState = new Map<number, MonitorResult>();
  private sessionSlots: number[] = [];
  private tickPhase = 0;
  private geom!: DeckGeometry;

  private mode: "dashboard" | "context" = "dashboard";
  private contextSession?: string;
  private contextItems: ActionItem[] = [];
  private contextPage = 0;
  private contextSlots: number[] = [];
  private backIndex = 0;
  private moreIndex = 0;

  private lastFocused?: string;
  private lastPress?: { index: number; time: number };
  private skillCache = new Map<string, ActionItem[]>();

  constructor(
    private readonly deck: Deck,
    readonly store: SessionStore,
    readonly views: ViewState,
    private readonly monitors: MonitorRunner,
    private readonly layout: Layout,
  ) {}

  async start(): Promise<void> {
    this.geom = this.deck.geometry();
    this.backIndex = this.geom.columns - 1;
    this.moreIndex = (this.geom.rows - 1) * this.geom.columns + (this.geom.columns - 1);
    this.contextSlots = Array.from({ length: this.geom.keyCount }, (_, i) => i).filter(
      (i) => i !== this.backIndex && i !== this.moreIndex,
    );

    await this.deck.setBrightness(85);
    await this.deck.clearAll();

    this.sessionSlots = this.layout.keys
      .map((role, i) => (role.kind === "session" ? i : -1))
      .filter((i) => i >= 0);
    this.views.slotCount = this.sessionSlots.length;

    const specs = this.monitorSpecs();
    this.monitors.on("result", (r: MonitorResult) => {
      this.monitorState.set(r.index, r);
      if (this.mode === "dashboard") void this.renderKey(r.index);
    });
    this.monitors.configure(specs);

    this.store.on("change", () => {
      this.views.reflow(this.liveSessions().length);
      if (this.mode === "dashboard") {
        void this.renderSessions();
        void this.renderPins();
      }
    });
    this.views.on("change", () => {
      if (this.mode === "dashboard") {
        void this.renderSessions();
        void this.renderPins();
      }
    });

    this.deck.onPress((index) => this.onPress(index));
    setInterval(() => this.tick(), 140).unref();

    await this.renderAll();
  }

  // --- rendering ----------------------------------------------------------

  private liveSessions(): SessionInfo[] {
    return this.store.list().filter((s) => s.status !== "ended");
  }

  private async renderAll(): Promise<void> {
    this.views.reflow(this.liveSessions().length);
    for (let i = 0; i < this.geom.keyCount; i++) await this.renderKey(i);
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
    const uri = this.mode === "context" ? this.contextFace(index) : this.dashboardFace(index);
    if (uri) await this.deck.renderKey(index, uri);
    else await this.deck.clearKey(index);
  }

  private dashboardFace(index: number): string | undefined {
    const role = this.layout.keys[index];
    if (!role) return emptyTile();
    switch (role.kind) {
      case "session": {
        const info = this.sessionAtSlot(index);
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
      case "skills":
        return skillsTile(this.selectedProject());
      case "empty":
        return emptyTile();
    }
  }

  private contextFace(index: number): string | undefined {
    const session = this.contextSession ? this.store.get(this.contextSession) : undefined;
    if (index === this.backIndex) return backTile(session?.project ?? "back");
    const pages = this.contextPageCount();
    if (index === this.moreIndex) return pages > 1 ? moreTile(this.contextPage, pages) : emptyTile();
    const slotPos = this.contextSlots.indexOf(index);
    if (slotPos < 0) return emptyTile();
    const item = this.contextItems[this.contextPage * this.contextSlots.length + slotPos];
    return item ? actionTile(item.label, item.kind) : emptyTile();
  }

  private sessionAtSlot(index: number): SessionInfo | undefined {
    const slotPos = this.sessionSlots.indexOf(index);
    if (slotPos < 0) return undefined;
    const offset = this.views.current().page * this.sessionSlots.length;
    return this.liveSessions()[offset + slotPos];
  }

  private selectedProject(): string {
    const id = this.lastFocused ?? this.liveSessions()[0]?.id;
    const s = id ? this.store.get(id) : undefined;
    return s ? s.project : "no session";
  }

  private contextPageCount(): number {
    return Math.max(1, Math.ceil(this.contextItems.length / this.contextSlots.length));
  }

  // --- context view -------------------------------------------------------

  private enterContext(sessionId: string): void {
    const session = this.store.get(sessionId);
    if (!session) return;
    this.contextSession = sessionId;
    this.contextPage = 0;
    this.contextItems = this.buildItems(session);
    this.mode = "context";
    focusTerminal(session.term);
    void this.renderContext();
    console.log(`▶ context: ${session.project} (${this.contextItems.length} items)`);
  }

  private exitContext(): void {
    this.mode = "dashboard";
    this.contextSession = undefined;
    void this.renderAll();
  }

  private buildItems(session: SessionInfo): ActionItem[] {
    const suggestions = parseSuggestions(session.transcriptPath);
    const skills = this.skillsFor(session.cwd);
    return [...QUICK_ACTIONS, ...suggestions, ...skills];
  }

  private skillsFor(cwd: string): ActionItem[] {
    const cached = this.skillCache.get(cwd);
    if (cached) return cached;
    const items = discoverSkills(cwd).map<ActionItem>((s) => ({
      label: s.id,
      text: `/${s.id}`,
      kind: "skill",
    }));
    this.skillCache.set(cwd, items);
    return items;
  }

  private async renderContext(): Promise<void> {
    for (let i = 0; i < this.geom.keyCount; i++) await this.renderKey(i);
  }

  // --- input --------------------------------------------------------------

  private onPress(index: number): void {
    if (this.mode === "context") return this.onContextPress(index);

    const role = this.layout.keys[index];
    if (!role) return;
    console.log(`▶ press: key ${index} (${role.kind})`);
    switch (role.kind) {
      case "session": {
        const info = this.sessionAtSlot(index);
        if (!info) break;
        focusTerminal(info.term);
        this.lastFocused = info.id;
        // Double-tap the same tile within the window -> open its context view.
        const now = Date.now();
        if (this.lastPress && this.lastPress.index === index && now - this.lastPress.time < DOUBLE_TAP_MS) {
          this.lastPress = undefined;
          this.enterContext(info.id);
        } else {
          this.lastPress = { index, time: now };
        }
        break;
      }
      case "pager":
        this.views.cycle(role.direction === "next" ? 1 : -1);
        break;
      case "attention": {
        const urgent = this.store.mostUrgent();
        if (urgent) {
          focusTerminal(urgent.term);
          this.lastFocused = urgent.id;
        }
        break;
      }
      case "monitor":
        this.monitors.runByIndex(this.monitorSpecs(), index);
        break;
      case "skills": {
        const id = this.lastFocused ?? this.liveSessions()[0]?.id;
        if (id) this.enterContext(id);
        else console.log("▶ skills: no session to act on");
        break;
      }
      case "empty":
        break;
    }
  }

  private onContextPress(index: number): void {
    if (index === this.backIndex) {
      this.exitContext();
      return;
    }
    if (index === this.moreIndex && this.contextPageCount() > 1) {
      this.contextPage = (this.contextPage + 1) % this.contextPageCount();
      void this.renderContext();
      return;
    }
    const slotPos = this.contextSlots.indexOf(index);
    if (slotPos < 0) return;
    const item = this.contextItems[this.contextPage * this.contextSlots.length + slotPos];
    if (!item) return;

    const session = this.contextSession ? this.store.get(this.contextSession) : undefined;
    if (session) {
      focusTerminal(session.term);
      sendText(session.term, item.text);
      if (item.kind === "skill") recordSkillUse(item.text.replace(/^\//, ""), Date.now());
      console.log(`▶ run [${item.kind}] ${item.text} -> ${session.project}`);
    }
    this.exitContext(); // back to the dashboard so you watch it run
  }

  private monitorSpecs() {
    return this.layout.keys
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.kind === "monitor")
      .map((x) => {
        const m = x.r as Extract<KeyRole, { kind: "monitor" }>;
        return { index: x.i, title: m.title, command: m.command, intervalSec: m.intervalSec };
      });
  }

  // --- animation ----------------------------------------------------------

  private tick(): void {
    if (this.mode !== "dashboard") return;
    const running = this.liveSessions().some((s) => s.status === "running");
    const urgent = this.store.mostUrgent();
    const monitorRunning = [...this.monitorState.values()].some((r) => r.running);
    if (!running && !urgent && !monitorRunning) return;

    this.tickPhase = (this.tickPhase + 0.06) % 1;

    for (const index of this.sessionSlots) {
      if (this.sessionAtSlot(index)?.status === "running") void this.renderKey(index);
    }
    for (let i = 0; i < this.layout.keys.length; i++) {
      const role = this.layout.keys[i]!;
      if (role.kind === "attention" && urgent) void this.renderKey(i);
      if (role.kind === "monitor" && this.monitorState.get(i)?.running) void this.renderKey(i);
    }
  }
}
