# ClaudeDeck 🎛️

**Turn your Elgato Stream Deck into a live mission-control surface for Claude Code.**

Every key becomes a window into your running Claude Code sessions — color-coded
by what they're doing, cyclable across virtual pages, with scriptable status
loops and one-press "jump to whoever needs me." Think of it as a Codex Micro,
but for Claude, and open source.

> Status: **v0.1 — working MVP.** Core dashboard, virtual pages, monitor loops,
> attention-jump, and the runtime icon engine are all built and tested.

---

## What it does

| Color | Meaning |
| ----- | ------- |
| 🟢 **green** | session is actively working |
| 🟡 **yellow** | session is waiting on you (permission / input) |
| ⚪ **grey** | session is idle — finished its turn, sitting there |
| 🔴 **red** | session errored out |

- **Live session dashboard** — drop *Session Tile* keys on the deck and they
  auto-fill with your running Claude Code sessions, each showing the project's
  initials, a spinner while working, and an elapsed timer while waiting.
- **Virtual pages** — more sessions than keys? The *Page Cycler* keys flip
  through pages so nothing is ever hidden.
- **Jump to session** — press any session tile to bring that terminal pane to
  the foreground (iTerm2 **and** macOS Terminal.app supported).
- **Attention Jump** — one key that stays dark when all's calm and pulses the
  moment any session needs you; press it to teleport to the highest-priority
  session. This is the killer key.
- **Ambient glow** — the pager keys' borders take on the color of your most
  urgent session, so status reaches you from peripheral vision.
- **Scriptable monitor loops** — point a key at any command on a timer (e.g.
  "check Slack every 10 minutes"); its output drives the tile's color and label.
- **Runtime icon engine** — every tile face is generated as SVG on the fly, so
  there are no image assets to manage and `npm install` needs no native builds.

---

## How it works

```
┌─────────────────┐   hook events    ┌──────────────────────────┐
│  Claude Code     │  (JSON on stdin) │  ClaudeDeck plugin        │
│  session(s)      │ ───────────────► │  (Node backend = daemon)  │
│  in iTerm/Term   │   unix socket    │                           │
└─────────────────┘                   │  • session store          │
        ▲                             │  • view/page state        │
        │  osascript focus            │  • icon engine (SVG)      │
        └─────────────────────────────│  • monitor loop runner    │
                                      └────────────┬─────────────┘
                                                   │ setImage / setTitle
                                                   ▼
                                         ┌────────────────────┐
                                         │  Stream Deck keys   │
                                         └────────────────────┘
```

The clever bit: **status doesn't come from scraping the terminal.** Claude Code
already fires lifecycle hooks (`SessionStart`, `UserPromptSubmit`,
`Notification`, `Stop`, …). A tiny hook bridge forwards each event over a local
unix socket to the plugin's Node backend, which *is* the daemon. That mapping is
the whole trick:

| Hook event | Status |
| ---------- | ------ |
| `SessionStart` | idle |
| `UserPromptSubmit` | running |
| `Notification` | waiting |
| `Stop` / `SubagentStop` | idle |
| `SessionEnd` | ended (pruned) |
| any event with non-zero `exit_code` | error |

---

## Install

**Requirements:** macOS, Node 20+, and — critically — the **Stream Deck
desktop software** installed and launched at least once. Download it from
[elgato.com/downloads](https://www.elgato.com/downloads); it's the app that
hosts plugins, separate from the hardware. (The Elgato `streamdeck` CLI ships
as a local dev-dependency, so no global install is needed.)

```bash
git clone https://github.com/christophergulliver/claudedeck
cd claudedeck
npm install             # also installs the Elgato CLI locally
npm run icons           # generate the static catalog icons
npm run build           # bundle the plugin backend
npm run link            # register the plugin with the Stream Deck app
npm run install-hooks   # wire ClaudeDeck into ~/.claude/settings.json
```

Restart any open Claude Code sessions so the new hooks load. Then open the
Stream Deck app — you'll find the **ClaudeDeck** category with four actions.

> If `npm run link` reports a missing `com.elgato.StreamDeck/Plugins`
> directory, the desktop software isn't installed yet — install and launch it
> first, then re-run.

During development, `npm run watch` rebuilds on save and `npm run restart`
reloads the plugin.

---

## Recommended layout

The design target is a 3×5 (15-key) deck, but any size works. This is the
layout the plugin was designed around:

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Session  │ Session  │ Session  │ Monitor  │ ▲ Page   │   ← top-right: next page
│  🟢      │  🟡      │  ⚪      │  Slack   │  Next    │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ Session  │ Session  │ Session  │ Attention│ Monitor  │   ← right-middle: Attention Jump
│  🟢      │  🔴      │  ⚪      │   !      │  CI      │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ Session  │ Session  │ Session  │ Monitor  │ ▼ Page   │   ← bottom-right: prev page
│  ⚪      │  ⚪      │  🟢      │  Git     │  Prev    │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

- **Top-right + bottom-right → Page Cycler** (set one to *Next*, one to *Prev*):
  cycle the dashboard's virtual pages, exactly as requested.
- **Right-middle → Attention Jump**: the "take me to who needs me" key.
- **Session Tiles**: as many as you like — they auto-fill and page.
- **Monitor Loops**: assign to *any* key; each runs its own command/interval.

---

## Monitor loops

A *Monitor Loop* key runs a command on a timer (and on press) and paints the
result. The contract is two optional stdout directives:

```
STATUS: ok | warn | alert | info     # green | yellow | red | blue
LABEL:  short caption
```

No `STATUS` line? Exit 0 → green, non-zero → red. Example Slack check
(`monitors/slack-check.sh`):

```bash
unread=$(slack unread --count)
if [ "$unread" -gt 0 ]; then
  echo "STATUS: warn"; echo "LABEL: $unread unread"
else
  echo "STATUS: ok";   echo "LABEL: inbox zero"
fi
```

`npm run install-hooks` drops the bundled examples (`slack-check.sh`,
`ci-status.sh`) into `~/.claude/claudedeck/monitors/`. See
[`monitors/README.md`](monitors/README.md) for the full protocol.

---

## Actions reference

| Action | UUID | Settings |
| ------ | ---- | -------- |
| **Session Tile** | `com.claudedeck.aikeyboard.session` | none — auto-fills |
| **Page Cycler** | `com.claudedeck.aikeyboard.pager` | direction: next / prev |
| **Attention Jump** | `com.claudedeck.aikeyboard.attention` | none |
| **Monitor Loop** | `com.claudedeck.aikeyboard.monitor` | title, command, interval |

---

## Development

```bash
npm run build     # bundle to com.claudedeck.aikeyboard.sdPlugin/bin/plugin.js
npm run watch     # rebuild on change
npm test          # runtime smoke test: socket → store → status → icons
npm run pack      # produce a distributable .streamDeckPlugin
```

Source map:

```
src/
  plugin.ts               entry: registers actions, starts the hook socket
  hub.ts                  coordinator: state + animation clock + slot layout
  types.ts                shared status/color/target contracts
  state/session-store.ts  hook events → four-color status model
  state/views.ts          virtual-page cycling
  ipc/socket-server.ts    unix-socket daemon that hooks talk to
  icons/render.ts         runtime SVG icon engine
  integrations/terminal.ts  iTerm2 + Terminal.app focus via osascript
  actions/                the four key types
hooks/
  claudedeck-hook.mjs     the bridge Claude Code invokes
  install.mjs             wires hooks into ~/.claude/settings.json
monitors/                 example monitor scripts
```

---

## Roadmap

- [ ] Token/cost readout per session tile
- [ ] Stream Deck+ dial support (scroll the session list, turn to page)
- [ ] Long-press actions (approve / send "continue" to a waiting session)
- [ ] Richer error detection (wrap the CLI to capture non-zero exits reliably)
- [ ] Windows terminal focus (Windows Terminal, ConEmu)
- [ ] Elgato Marketplace submission

Contributions welcome — this is built to be a community plugin.

## License

MIT © Christopher Gulliver
