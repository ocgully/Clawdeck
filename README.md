# Clawdeck 🐾

**Your Elgato Stream Deck, turned into live mission-control for Claude Code.**

Clawdeck is a standalone macOS daemon that takes over your Stream Deck and turns
every key into a window on a running Claude Code session — colour-coded by what
it's doing, with one-press jump-to-terminal, scriptable status loops, and a
double-tap drill-down that lets you fire off skills without touching the keyboard.

It **replaces the Elgato desktop app**. Clawdeck talks to the hardware directly
over USB HID — no plugin host, no dragging tiles around in someone else's GUI.

> **Status: working beta.** Validated on real hardware (Stream Deck MK.2). Neo
> support is implemented and unit-tested. MIT licensed.

---

## What it looks like

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Session  │ Session  │ Session  │ Slack    │  ▲ page  │
│  🟢 RA   │  🟡 WEB  │  ⚪ INF  │  3 unread│          │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ Session  │ Session  │ Session  │ Skills   │  ❗ jump │
│  🟢 DOC  │  🔴 BIL  │  ⚪ AUT  │  ✦       │          │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ Session  │ Session  │ Session  │ Session  │  ▼ page  │
│  ⚪ CLI  │  ⚪ SRC  │  🟢 MOB  │  ⚪ API  │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

| Colour | Meaning |
| ------ | ------- |
| ⚪ **grey** | idle — finished its turn, waiting on you to say something |
| 🟢 **green** | actively working (animated spinner) |
| 🟡 **yellow** | needs you — a permission prompt or a question, with a timer |
| 🔴 **red** | a real in-session error: rate limit, overload, timeout |

---

## Features

- **Live session dashboard.** Sessions fill the deck in stable order and stay
  put; new ones append to the next free slot. Each tile shows the project
  initials and its state.
- **Attention Jump.** One key that stays dark when everything's calm and pulses
  the moment any session needs you. Press it to jump straight to the
  highest-priority session. The killer key.
- **Jump to terminal.** Press any session tile to bring that exact terminal
  window/tab to the front. Works with **iTerm2** and **Terminal.app**.
- **Double-tap → context view.** Drill into a session and get:
  - **Quick actions** — Continue, Run tests, Commit, Explain, Fix errors
  - **Suggestions** parsed from that session's last reply (its offered options
    and questions), so you can pick a next step
  - **All your skills**, ranked by how often you run them, 1-shot runnable
  - Pressing an item types it into that session and submits. Back key top-right.
- **Virtual pages.** More sessions than keys? Page through them; nothing hidden.
- **Ambient glow.** Pager keys take on the colour of your most urgent session, so
  status reaches you from peripheral vision.
- **Scriptable monitor loops.** Point a key at any command on a timer (e.g.
  check Slack every 10 min); its output drives the tile's colour and caption.
- **Runs from login.** A launchd agent keeps it alive headlessly.

---

## Supported hardware

| Device | Keys | Notes |
| ------ | ---- | ----- |
| **Stream Deck MK.2 / Original V2** | 15 (5×3) | Primary target, hardware-validated |
| **Stream Deck XL** | 32 (8×4) | Layout auto-adapts |
| **Stream Deck Neo** | 8 (4×2) + 2 side buttons + LCD info bar | Pagers map to the RGB side buttons; the info bar shows a live status tally |
| **Stream Deck Mini** | 6 (3×2) | Layout auto-adapts |

Layouts are generated from the device's real control geometry, so odd shapes
(like the Neo, which isn't a dense grid) are handled correctly.

---

## How it works

```
┌──────────────────┐   hook events    ┌───────────────────────────┐
│  Claude Code     │  (JSON on stdin) │  Clawdeck daemon          │
│  session(s)      │ ───────────────► │                           │
│  in iTerm/Term   │   unix socket    │  • session store          │
└──────────────────┘                  │  • transcript watcher     │
        ▲                             │  • icon engine (SVG)      │
        │  osascript: focus + type    │  • monitor loops          │
        └─────────────────────────────│  • skills / context view  │
                                      └────────────┬──────────────┘
                                                   │ USB HID
                                                   ▼
                                         ┌────────────────────┐
                                         │   Stream Deck      │
                                         └────────────────────┘
```

**Status doesn't come from scraping your terminal.** Claude Code already fires
lifecycle hooks; a tiny bridge forwards each one over a local unix socket to the
daemon:

| Signal | Status |
| ------ | ------ |
| `SessionStart` | idle |
| `UserPromptSubmit` | running |
| `Notification` | waiting |
| `Stop` / `SubagentStop` | idle |
| `SessionEnd` | ended (pruned) |
| `api_error` in the transcript | **error** |

Red is deliberately *not* "the process crashed" — a crash just ends the session.
Red means the session is **alive but stuck**: rate limited, overloaded, or timing
out. Clawdeck tails each session's transcript for the `api_error` records Claude
writes, shows the reason and retry count (`rate limit 3/10`), and keeps the tile
red until the session actually recovers or you send a new prompt.

---

## Quick start

**Requirements:** macOS, Node 20+, a Stream Deck, and the **Elgato desktop app
quit or uninstalled** (it claims the USB device exclusively).

```bash
git clone https://github.com/ocgully/Clawdeck
cd Clawdeck
npm install
npm run build
npm run install-hooks   # wires Clawdeck into ~/.claude/settings.json
npm start
```

Then grant two macOS permissions when prompted — see
**[ONBOARDING.md](docs/ONBOARDING.md)** for the full first-run walkthrough,
including the permissions that trip everyone up.

To run it from login instead:

```bash
npm run service:install     # launchd agent, auto-restarts, logs to ~/.claude/clawdeck/
npm run service:uninstall   # undo
```

Try it without any real sessions:

```bash
CLAWDECK_DEMO=1 npm start
```

---

## macOS permissions (important)

Clawdeck needs two, and macOS will silently do nothing if they're missing:

| Permission | Why | Symptom if missing |
| ---------- | --- | ------------------ |
| **Input Monitoring** | reading button presses over HID | tiles render, but presses do nothing |
| **Automation** | focusing terminals + typing into sessions | jump-to-terminal and 1-shot run silently fail |

Grant them to **the app that runs the daemon** (your terminal, or Node for the
launchd agent), then fully quit and reopen it — permissions only take effect on
relaunch. Clawdeck detects the Input Monitoring case on startup and prints
guidance rather than failing silently.

---

## Configuration

Your layout lives at `~/.claude/clawdeck/layout.json` and is generated on first
run to match your deck. Edit it to rearrange keys — each entry is one key:

```json
{ "version": 3, "keys": [
  { "kind": "session" },
  { "kind": "monitor", "title": "Slack", "command": "~/.claude/clawdeck/monitors/slack-check.sh", "intervalSec": 600 },
  { "kind": "skills" },
  { "kind": "attention" },
  { "kind": "pager", "direction": "next" },
  { "kind": "empty" }
]}
```

### Monitor loops

Any command on a timer. Print either directive to drive the tile:

```
STATUS: ok | warn | alert | info     # green | yellow | red | blue
LABEL:  short caption
```

No `STATUS` line? Exit 0 → green, non-zero → red. Examples ship in
[`monitors/`](monitors/) and install to `~/.claude/clawdeck/monitors/`.

---

## Development

```bash
npm run build     # bundle daemon -> dist/clawdeck.mjs
npm run watch     # rebuild on change
npm test          # 34-assertion suite: socket, store, statuses, views, icons,
                  # sticky errors, transcript watcher, suggestions, layouts
npm start         # run it
```

```
src/
  standalone/     daemon: device, raster, layout, controller, monitor-runner,
                  transcript-watcher, skills, suggestions, permissions, main
  state/          session-store (hook events -> status), views (paging)
  icons/render.ts runtime SVG icon engine (no image assets, no native builds)
  integrations/   terminal focus + text injection via osascript
  ipc/            unix-socket server the hooks talk to
hooks/            the bridge Claude Code invokes + installer
monitors/         example monitor scripts
```

More: **[Wiki](https://github.com/ocgully/Clawdeck/wiki)** ·
[Architecture](wiki/Architecture.md) ·
[Troubleshooting](wiki/Troubleshooting.md) ·
[Contributing](wiki/Contributing.md)

---

## Roadmap

- [ ] Signed `.app` bundle (clean permission identity, no terminal-permission dance)
- [ ] Stream Deck+ dial support
- [ ] Windows / Linux terminal focus
- [ ] Richer context view (diff stats, token/cost per session)

## License

MIT © Christopher Gulliver
