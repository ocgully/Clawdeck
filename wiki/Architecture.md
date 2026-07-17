# Architecture

## Why standalone, not an Elgato plugin

Stream Deck "plugins" are hosted *by* the Elgato desktop app: it owns the USB
device and speaks a WebSocket protocol to plugin processes. That means a plugin
can't exist without their app, and you configure it by dragging tiles in their
GUI.

Clawdeck instead talks to the hardware directly (`@elgato-stream-deck/node` over
`node-hid`) and renders every key itself. The trade: no Elgato Marketplace
distribution, and the Elgato app must be quit (only one process can own the
device). The win: it *is* the app.

## Data flow

```
┌──────────────────┐   hook events    ┌───────────────────────────┐
│  Claude Code     │  (JSON on stdin) │  Clawdeck daemon          │
│  session(s)      │ ───────────────► │   src/standalone/main.ts  │
└──────────────────┘   unix socket    │                           │
        ▲              ~/.claude/     │  SessionStore  ViewState  │
        │              clawdeck/      │  MonitorRunner            │
        │              deck.sock      │  TranscriptWatcher        │
        │                             │  Controller ──► icons/    │
        │  osascript                  └────────────┬──────────────┘
        │  (focus + type)                          │ USB HID
        └──────────────────────────────────────────┤
                                          ┌────────▼───────────┐
                                          │   Stream Deck      │
                                          └────────────────────┘
```

## Status derivation

Status is **not** scraped from the terminal. `hooks/clawdeck-hook.mjs` is
registered for six Claude Code lifecycle events; each fires the script, which
forwards one JSON line to the daemon's unix socket.

| Hook event | Status |
| ---------- | ------ |
| `SessionStart` | idle |
| `UserPromptSubmit` | running |
| `Notification` | waiting |
| `Stop` / `SubagentStop` | idle |
| `SessionEnd` | ended → pruned |

Only these six are hooked — deliberately *not* `PreToolUse`/`PostToolUse`, which
fire on every tool call and would spawn a process each time.

Claude Code reloads hooks from `settings.json` **live**, so installing them
affects already-running sessions.

## Error detection

Claude Code has no "error" or "crash" hook, and a crash isn't what we want to
show anyway — a crashed session simply ends. What matters is a session that's
**alive but stuck**.

Claude writes structured records to its transcript JSONL:

```json
{ "type": "system", "subtype": "api_error", "level": "error",
  "error": { "status": 429 }, "retryAttempt": 3, "maxRetries": 10 }
```

`TranscriptWatcher` tails each session's transcript (path comes from the hook
payload), polling for appended lines. On an `api_error` it emits a synthetic
`ApiError` event carrying a label like `rate limit 3/10`; on the next genuine
assistant/user message it emits `ApiRecovered`.

**Sticky errors:** a plain turn-end (`Stop`) must not quietly downgrade a stuck
session to idle, so the store keeps `error` until either the watcher reports
recovery or you submit a new prompt.

## Terminal integration

Two things need the terminal: focusing it, and typing into it.

The hard part is *identifying* it. Claude Code spawns hooks **without a
controlling terminal**, so `ps -o tty=` on the hook process returns `??`. The fix
is to **walk the process tree** to the first ancestor with a real `ttysNNN` — the
Claude TUI or its shell. That tty matches both `tty of tab` (Terminal.app) and
`tty of session` (iTerm2) in AppleScript, making tty the universal key.

- **Focus:** `focusTerminal()` matches the tab/session by tty and raises it.
- **Type:** `sendText()` uses iTerm's `write text` / Terminal's `do script … in`,
  both of which append a return — which submits the prompt.

Both need macOS **Automation** permission.

## Rendering

Every tile face is generated as an **SVG string** (`src/icons/render.ts`), then
rasterized to raw RGBA with `sharp` and pushed via `fillKeyBuffer`. No image
assets to manage. Results are cached by `(size + uri)`, so only genuinely
changing tiles (spinners, pulses) re-encode.

An animation clock (~7fps) repaints **only** animated keys — running spinners,
the attention pulse, monitor "checking…" — never the whole panel.

RGB-only keys (Neo's side buttons) can't take an image; the controller lights
them with a representative colour instead. See [Hardware Support](Hardware-Support).

## Modules

| Path | Responsibility |
| ---- | -------------- |
| `standalone/main.ts` | entry: open deck, start socket + watchers |
| `standalone/device.ts` | the only file touching the HID lib; real geometry |
| `standalone/controller.ts` | brain: state → keys, presses → actions, modes |
| `standalone/layout.ts` | key→role config, generated per deck geometry |
| `standalone/raster.ts` | SVG → RGBA via sharp, cached |
| `standalone/monitor-runner.ts` | user status loops (`STATUS:`/`LABEL:`) |
| `standalone/transcript-watcher.ts` | api_error tailing |
| `standalone/skills.ts` | skill discovery + usage ranking |
| `standalone/suggestions.ts` | quick actions + parsed next steps |
| `standalone/permissions.ts` | Input Monitoring preflight |
| `state/session-store.ts` | hook events → the four-colour model |
| `state/views.ts` | virtual paging |
| `icons/render.ts` | the SVG icon engine |
| `integrations/terminal.ts` | focus + type via osascript |
| `ipc/socket-server.ts` | the unix socket hooks talk to |
