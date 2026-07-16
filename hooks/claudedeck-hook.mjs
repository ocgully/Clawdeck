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
  // The hook shares Claude's controlling terminal. Terminal.app can only be
  // targeted by TTY, so resolve it from the process table.
  try {
    const out = execSync(`ps -o tty= -p ${process.pid}`, { encoding: "utf8" }).trim();
    if (out && out !== "??") return out.startsWith("/dev/") ? out : `/dev/${out}`;
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
