# Troubleshooting

Most problems are one of **two macOS permissions**. macOS denies both *silently*
— nothing errors, things just don't happen.

---

## Presses do nothing (tiles render fine)

**Cause: Input Monitoring not granted.**

Writing images to keys needs no permission. **Reading button presses does.** So a
deck with no Input Monitoring looks perfect and ignores every press.

Verify:

```bash
node -e "console.log(require('node-mac-permissions').getAuthStatus('input-monitoring'))"
# "not determined" or "denied"  -> that's your problem
```

Fix:

1. **System Settings → Privacy & Security → Input Monitoring**
   `open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"`
2. Enable **the app that runs the daemon** — your terminal, or **Node** for the
   launchd service.
3. **Fully quit (⌘Q) and reopen it.** Permissions only apply on relaunch —
   restarting just the daemon is not enough.

> Running the daemon in a *different* terminal than your Claude session means
> restarting it won't kill your chat.

---

## Pressing a tile logs the press but doesn't focus the terminal

**Cause: Automation not granted.**

Focusing and typing use AppleScript to control Terminal/iTerm. macOS prompts the
first time — if you dismissed it:

**System Settings → Privacy & Security → Automation** → under the app running the
daemon, enable **Terminal** / **iTerm**.

---

## `No Stream Deck found`

- The **Elgato desktop app is running** — it claims the USB device exclusively.
  Quit it. (See [Installation](Installation) to remove it entirely.)
- Or the deck is unplugged. Check:

```bash
node -e "import('@elgato-stream-deck/node').then(async m=>console.log(await m.listStreamDecks()))"
```

If it *enumerates* but won't open, something else has it open — almost always
Elgato's app or a second Clawdeck instance.

---

## Sessions never appear

1. Hooks installed? `grep -c clawdeck-hook ~/.claude/settings.json` (expect 6)
2. Daemon listening? `ls -l ~/.claude/clawdeck/deck.sock`
3. Hooks reload live — no session restart needed. Send a prompt to make a session
   report.
4. Test the pipe by hand:

```bash
echo '{"hook_event_name":"SessionStart","session_id":"t1","cwd":"/tmp/demo"}' \
  | node hooks/clawdeck-hook.mjs
```

A grey `demo` tile should appear.

---

## A session shows up but pressing it doesn't focus

It hasn't reported since some fix/restart, so it has no terminal identity yet.
Send it a prompt — the next hook event carries the tty and it'll work.

---

## The Skills key is blank

Intentional. It hides when there are no live sessions, since there'd be nothing
to run a skill against.

---

## Skills list looks wrong / empty

```bash
node -e "import('./dist/clawdeck.mjs')" # not this — instead:
ls ~/.claude/plugins/**/skills/*/SKILL.md | head
```

Clawdeck discovers plugin, user, and project-local skills. Built-in Claude Code
skills that aren't on disk aren't discoverable.

---

## Layout looks wrong after an upgrade

```bash
rm ~/.claude/clawdeck/layout.json   # regenerates on next start
```

Clawdeck auto-regenerates when the schema version or key count changes, but this
forces it.

---

## Red tile stuck

Errors are **sticky by design** — a turn ending won't clear a real API error.
It clears when the session recovers or you send a new prompt. If you think it's
wrong, check the transcript:

```bash
grep -c '"subtype":"api_error"' ~/.claude/projects/*/<session-id>.jsonl
```

---

## launchd service issues

```bash
tail -f ~/.claude/clawdeck/daemon.log      # what it's doing
tail -f ~/.claude/clawdeck/daemon.err.log  # what went wrong
launchctl print gui/$UID/com.clawdeck.daemon | head -20
```

- **Restart loop?** Usually "no deck found" (unplugged, or Elgato app running).
  It throttles to one retry per 10s.
- **Don't run `npm start` while the service is loaded** — they'll fight for the
  device. `npm run service:uninstall` first.

---

## Still stuck?

Open an issue at <https://github.com/ocgully/Clawdeck/issues> with:

- macOS version, deck model, `node --version`
- Daemon output (or `daemon.err.log`)
- `getAuthStatus('input-monitoring')` result
