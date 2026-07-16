#!/usr/bin/env node
/**
 * ClaudeDeck hook bridge.
 *
 * Claude Code invokes this on session lifecycle events, passing the event JSON
 * on stdin. We enrich it with the iTerm session identifiers from the
 * environment and forward one line to the plugin's unix socket, then exit.
 *
 * It must never block or fail Claude: if the deck isn't running, we exit 0
 * silently after a short timeout. Wire it up with `npm run install-hooks`.
 */
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SOCKET = path.join(os.homedir(), ".claude", "claudedeck", "deck.sock");
const HARD_TIMEOUT_MS = 400;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) return resolve("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function currentTty() {
  // Claude spawns hooks WITHOUT a controlling terminal, so the hook's own tty
  // is "??". But an ancestor (the Claude TUI, or its shell) owns the real
  // terminal. Walk the process tree to the first ancestor with a tty device —
  // that's the terminal to focus, and it matches Terminal.app's tab tty and
  // iTerm's session tty in AppleScript.
  try {
    const out = execSync("ps -Ao pid=,ppid=,tty=", { encoding: "utf8" });
    const tree = new Map();
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/);
      if (m) tree.set(Number(m[1]), { ppid: Number(m[2]), tty: m[3] });
    }
    let pid = process.pid;
    for (let guard = 0; pid && guard < 40; guard++) {
      const node = tree.get(pid);
      if (!node) break;
      if (/^ttys/.test(node.tty)) return `/dev/${node.tty}`;
      pid = node.ppid;
      if (pid <= 1) break;
    }
  } catch {}
  return undefined;
}

function termTarget() {
  const iterm = process.env.ITERM_SESSION_ID || "";
  const sessionId = iterm || process.env.TERM_SESSION_ID || "";
  const guid = iterm.includes(":") ? iterm.split(":").pop() : undefined;
  return {
    termProgram: process.env.TERM_PROGRAM || undefined,
    sessionId: sessionId || undefined,
    guid,
    tty: currentTty(),
  };
}

async function main() {
  const raw = await readStdin();
  let hook = {};
  try {
    hook = JSON.parse(raw || "{}");
  } catch {
    hook = {};
  }

  const message = {
    type: "event",
    event: hook.hook_event_name || process.argv[2] || "unknown",
    session_id: hook.session_id || "unknown",
    cwd: hook.cwd || process.cwd(),
    transcript_path: hook.transcript_path,
    model: hook.model?.id || hook.model,
    note: hook.message || hook.notification || undefined,
    ts: Date.now(),
    term: termTarget(),
  };

  await send(message);
}

function send(message) {
  return new Promise((resolve) => {
    const done = () => {
      try {
        socket.destroy();
      } catch {}
      resolve();
    };
    const timer = setTimeout(done, HARD_TIMEOUT_MS);
    const socket = net.connect(SOCKET, () => {
      socket.write(JSON.stringify(message) + "\n", () => {
        clearTimeout(timer);
        socket.end();
        resolve();
      });
    });
    socket.on("error", () => {
      clearTimeout(timer);
      done();
    });
  });
}

main().then(
  () => process.exit(0),
  () => process.exit(0),
);
