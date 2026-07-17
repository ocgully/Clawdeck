import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type HookMessage, SOCKET_DIR, SOCKET_FILE } from "../types";

/**
 * Where hooks talk to the daemon. Unix domain socket on macOS/Linux; a named
 * pipe on Windows (AF_UNIX support there is inconsistent, and named pipes are
 * the native IPC primitive Node's `net` handles transparently).
 */
export function socketPath(): string {
  if (process.platform === "win32") return "\\\\.\\pipe\\clawdeck";
  return join(homedir(), SOCKET_DIR, SOCKET_FILE);
}

/**
 * Listens on a unix domain socket for newline-delimited JSON messages from
 * Claude Code hooks. Local-only (file permissions), no ports, no conflicts.
 * Emits 'message' with each parsed HookMessage.
 */
export class HookSocketServer extends EventEmitter {
  private server?: Server;

  start(): void {
    const path = socketPath();
    // Named pipes are not filesystem entries — nothing to create or clean up.
    if (process.platform !== "win32") {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
      // A leftover socket file from a crash would block binding.
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          /* best effort */
        }
      }
    }

    this.server = createServer((socket) => {
      let buffer = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) this.handleLine(line);
        }
      });
      socket.on("error", () => socket.destroy());
    });

    this.server.on("error", (err) => this.emit("error", err));
    this.server.listen(path, () => this.emit("listening", path));
  }

  private handleLine(line: string): void {
    try {
      const msg = JSON.parse(line) as HookMessage;
      if (msg && msg.type === "event" && typeof msg.session_id === "string") {
        this.emit("message", msg);
      }
    } catch {
      // Ignore malformed frames rather than crashing the daemon.
    }
  }

  stop(): void {
    this.server?.close();
    if (process.platform === "win32") return; // pipe disappears with the process
    try {
      unlinkSync(socketPath());
    } catch {
      /* best effort */
    }
  }
}
