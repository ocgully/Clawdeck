import { exec } from "node:child_process";
import { homedir } from "node:os";
import {
  action,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { monitorTile, type MonitorLevel } from "../icons/render";
import { hub } from "../hub";

interface MonitorSettings {
  title?: string;
  /** Shell command or path to a script. Runs in your login shell. */
  command?: string;
  /** How often to run it, in seconds. Defaults to 600 (10 minutes). */
  intervalSec?: number;
}

interface Runner {
  action: KeyAction;
  settings: MonitorSettings;
  timer?: ReturnType<typeof setInterval>;
  running: boolean;
}

const LEVELS: MonitorLevel[] = ["ok", "warn", "alert", "info", "running", "unknown"];

/**
 * A user-scriptable status loop on a single key. Point it at any command and
 * interval. The command's output drives the tile:
 *
 *   - First line `STATUS: ok|warn|alert|info` sets the color.
 *   - First line `LABEL: <text>` (or the last non-directive line) is the caption.
 *   - No STATUS directive? exit 0 = ok (green), non-zero = alert (red).
 *
 * Example: a script that greps unread Slack and prints "STATUS: warn" +
 * "LABEL: 3 unread" turns the tile yellow with "3 unread". Assign it to any key.
 */
@action({ UUID: "com.claudedeck.aikeyboard.monitor" })
export class Monitor extends SingletonAction<MonitorSettings> {
  private readonly runners = new Map<string, Runner>();

  constructor() {
    super();
    hub.on("tick", () => this.animate());
  }

  override onWillAppear(ev: WillAppearEvent<MonitorSettings>): void {
    if (!ev.action.isKey()) return;
    const settings = ev.payload.settings ?? {};
    const runner: Runner = { action: ev.action as KeyAction, settings, running: false };
    this.runners.set(ev.action.id, runner);
    this.paint(runner, "info", settings.command ? "ready" : "set command");
    this.schedule(runner);
  }

  override onWillDisappear(ev: WillDisappearEvent<MonitorSettings>): void {
    const runner = this.runners.get(ev.action.id);
    if (runner?.timer) clearInterval(runner.timer);
    this.runners.delete(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<MonitorSettings>): void {
    const runner = this.runners.get(ev.action.id);
    if (!runner) return;
    runner.settings = ev.payload.settings ?? {};
    this.schedule(runner); // re-arm with the new interval/command
  }

  override onKeyDown(ev: KeyDownEvent<MonitorSettings>): void {
    const runner = this.runners.get(ev.action.id);
    if (runner) this.run(runner); // press = run now
  }

  private schedule(runner: Runner): void {
    if (runner.timer) clearInterval(runner.timer);
    const intervalMs = Math.max(5, runner.settings.intervalSec ?? 600) * 1000;
    if (runner.settings.command) {
      this.run(runner);
      runner.timer = setInterval(() => this.run(runner), intervalMs);
      runner.timer.unref();
    }
  }

  private run(runner: Runner): void {
    const cmd = runner.settings.command?.trim();
    if (!cmd) {
      this.paint(runner, "info", "set command");
      return;
    }
    runner.running = true;
    this.paint(runner, "running", "checking…");
    exec(
      cmd,
      { timeout: 60_000, cwd: homedir(), shell: process.env.SHELL || "/bin/zsh" },
      (err, stdout, stderr) => {
        runner.running = false;
        const { level, label } = parseOutput(stdout, err ? 1 : 0, stderr);
        this.paint(runner, level, label);
      },
    );
  }

  private paint(runner: Runner, level: MonitorLevel, caption: string): void {
    const title = runner.settings.title || "Monitor";
    void runner.action.setImage(monitorTile(title, level, caption, hub.phase));
  }

  private animate(): void {
    for (const runner of this.runners.values()) {
      if (runner.running) {
        this.paint(runner, "running", "checking…");
      }
    }
  }
}

function parseOutput(
  stdout: string,
  exitCode: number,
  stderr: string,
): { level: MonitorLevel; label: string } {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  let level: MonitorLevel | undefined;
  let label: string | undefined;

  for (const line of lines) {
    const status = /^STATUS:\s*(\w+)/i.exec(line);
    if (status && LEVELS.includes(status[1]!.toLowerCase() as MonitorLevel)) {
      level = status[1]!.toLowerCase() as MonitorLevel;
      continue;
    }
    const lbl = /^LABEL:\s*(.+)/i.exec(line);
    if (lbl) {
      label = lbl[1]!.trim();
      continue;
    }
    if (label === undefined) label = line; // first plain line as fallback caption
  }

  if (!level) level = exitCode === 0 ? "ok" : "alert";
  if (!label) label = exitCode === 0 ? "ok" : (stderr.trim().split("\n")[0] || "failed");
  return { level, label };
}
