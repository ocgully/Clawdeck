# Onboarding — first run, step by step

This walks you from a fresh clone to a live deck. It should take ~10 minutes.
Most of that is two macOS permissions that fail *silently* if you skip them —
they're called out below.

---

## 0. Prerequisites

- **macOS** (Ventura or later recommended)
- **Node 20+** — `node --version`
- An **Elgato Stream Deck** (MK.2 / Original V2 / XL / Neo / Mini)
- **Claude Code** installed and working

---

## 1. Quit or uninstall the Elgato desktop app

Clawdeck talks to the Stream Deck **directly over USB**, and the hardware only
allows one owner. If the Elgato app is running, Clawdeck can't open the device
and you'll see:

```
No Stream Deck found. Plug it in and make sure the Elgato app isn't running.
```

Quit it from the menu bar. To stop it coming back at login, remove it:

```bash
# 1. Quit it, then:
sudo rm -rf "/Applications/Elgato Stream Deck.app"
# 2. Optional leftovers:
rm -rf ~/Library/Application\ Support/com.elgato.StreamDeck
rm -f  ~/Library/Preferences/com.elgato.StreamDeck.plist
```

Then check **System Settings → General → Login Items** and remove any Elgato
Stream Deck entry.

> You don't have to uninstall — quitting is enough. Uninstalling just stops it
> stealing the device on next boot.

---

## 2. Install Clawdeck

```bash
git clone https://github.com/ocgully/Clawdeck
cd Clawdeck
npm install
npm run build
```

---

## 3. Wire it into Claude Code

```bash
npm run install-hooks
```

This adds Clawdeck's hook to `~/.claude/settings.json` for six lifecycle events
and copies the example monitors to `~/.claude/clawdeck/monitors/`. It is
idempotent and preserves your existing settings.

**You do not need to restart your Claude sessions** — Claude Code reloads hooks
from `settings.json` live, so running sessions start reporting immediately.

---

## 4. Start it

```bash
npm start
```

You should see:

```
Clawdeck: opened 15-key deck (5x3, 72px)
Clawdeck: listening for hooks at /Users/you/.claude/clawdeck/deck.sock
```

Your deck lights up. Empty session slots show a dashed placeholder until sessions
appear.

No hardware handy? See it anyway:

```bash
CLAWDECK_DEMO=1 npm start
```

---

## 5. Grant the two macOS permissions ⚠️

This is the step everyone gets caught by. macOS blocks these **silently** — no
error, things just don't happen.

### Input Monitoring — required for button presses

Writing images to keys needs no permission; **reading button presses does**.
Without it the deck looks perfect and every press is ignored.

1. **System Settings → Privacy & Security → Input Monitoring**
   (or run: `open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"`)
2. Enable the app running the daemon — **your terminal** (Terminal / iTerm), or
   **Node** if you use the launchd service.
3. **Fully quit (⌘Q) and reopen that app**, then `npm start` again.
   Permissions only apply on relaunch.

Clawdeck checks this on startup and prints a banner if it's missing.

> **Tip:** run the daemon in a *different* terminal than the one you chat with
> Claude in, so restarting it doesn't kill your session.

### Automation — required for jump-to-terminal and 1-shot run

The first time Clawdeck focuses a terminal or types into a session, macOS asks
for permission to control that app. **Click OK.** If you dismissed it:

**System Settings → Privacy & Security → Automation** → enable Terminal / iTerm
under the app running the daemon.

---

## 6. Verify it end to end

1. Open a **new terminal window** and start a session: `cd ~/some-project && claude`
2. Watch your deck — a tile appears:
   - **grey** when it starts
   - **green** with a spinner while it works
   - **yellow** if it asks permission (and the Attention key pulses)
   - **grey** again when it's done
3. **Press that tile** → the terminal window jumps to the front.
4. **Double-tap the tile** → the context view opens: quick actions, suggestions,
   and your skills. Press one → it types into that session and runs.
5. Press **Back** (top-right) to return to the dashboard.

---

## 7. Run it from login (optional)

```bash
npm run service:install
```

Installs a launchd agent that starts at login and restarts if it exits. Logs:

```bash
tail -f ~/.claude/clawdeck/daemon.log
```

Two caveats:
- **Don't also run `npm start`** — two processes can't own the deck.
- The agent runs as **Node**, so grant Node the two permissions above.

Undo with `npm run service:uninstall`.

---

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `No Stream Deck found` | Elgato app is running (quit it), or the deck is unplugged |
| Tiles render, presses do nothing | **Input Monitoring** not granted, or the terminal wasn't relaunched after granting |
| Pressing a tile logs but doesn't focus | **Automation** not granted for that terminal app |
| Sessions never appear | `npm run install-hooks` not run, or the daemon isn't listening — check `~/.claude/clawdeck/deck.sock` exists |
| A session appears but pressing it does nothing | It hasn't fired an event since the daemon started — send it a prompt so it re-reports |
| Skills key is blank | That's intentional — it hides when there are no sessions |
| Layout looks wrong after upgrading | Delete `~/.claude/clawdeck/layout.json`; it regenerates |

More detail in the [Troubleshooting wiki page](../wiki/Troubleshooting.md).
