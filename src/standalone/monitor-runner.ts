import { exec } from "node:child_process";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import type { MonitorLevel } from "../icons/render";

/**
 * Runs user-defined status commands on their own intervals and emits results.
 * One instance manages every monitor key on the deck, keyed by the key index.
 *
 * Output protocol (stdout):
 *   STATUS: ok|warn|alert|info   -> level (color)
 *   LABEL:  text                 -> caption
 * No STATUS line: exit 0 => ok, non-zero => alert.
 */
export interface MonitorResult {
  index: number;
  level: MonitorLevel;
  caption: string;
  running: boolean;
}

interface MonitorSpec {
  index: number;
  title: string;
  command: string;
  intervalSec: number;
}

const LEVELS: MonitorLevel[] = ["ok", "warn", "alert", "info", "running", "unknown"];

export class MonitorRunner extends EventEmitter {
  private timers = new Map<number, ReturnType<typeof setInterval>>();
  private running = new Set<number>();

  /** Replace the full set of monitors (called on layout load/reload). */
  configure(specs: MonitorSpec[]): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    this.running.clear();

    for (const spec of specs) {
      this.run(spec); // fire immediately
      const ms = Math.max(5, spec.intervalSec) * 1000;
      const timer = setInterval(() => this.run(spec), ms);
      timer.unref();
      this.timers.set(spec.index, timer);
    }
  }

  /** Run one monitor now (e.g. because its key was pressed). */
  runByIndex(specs: MonitorSpec[], index: number): void {
    const spec = specs.find((s) => s.index === index);
    if (spec) this.run(spec);
  }

  private run(spec: MonitorSpec): void {
    if (this.running.has(spec.index)) return;
    this.running.add(spec.index);
    this.emit("result", { index: spec.index, level: "running", caption: "checking…", running: true } as MonitorResult);

    exec(
      spec.command,
      { timeout: 60_000, cwd: homedir(), shell: process.env.SHELL || "/bin/zsh" },
      (err, stdout, stderr) => {
        this.running.delete(spec.index);
        const { level, caption } = parse(stdout, err ? 1 : 0, stderr);
        this.emit("result", { index: spec.index, level, caption, running: false } as MonitorResult);
      },
    );
  }

  stop(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }
}

function parse(stdout: string, exitCode: number, stderr: string): { level: MonitorLevel; caption: string } {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  let level: MonitorLevel | undefined;
  let caption: string | undefined;

  for (const line of lines) {
    const status = /^STATUS:\s*(\w+)/i.exec(line);
    if (status && LEVELS.includes(status[1]!.toLowerCase() as MonitorLevel)) {
      level = status[1]!.toLowerCase() as MonitorLevel;
      continue;
    }
    const lbl = /^LABEL:\s*(.+)/i.exec(line);
    if (lbl) {
      caption = lbl[1]!.trim();
      continue;
    }
    if (caption === undefined) caption = line;
  }

  if (!level) level = exitCode === 0 ? "ok" : "alert";
  if (!caption) caption = exitCode === 0 ? "ok" : stderr.trim().split("\n")[0] || "failed";
  return { level, caption };
}
