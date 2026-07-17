# Windows 11

Clawdeck runs on Windows 11. The deck, the colours, the pages, the monitors and
the skills view all work exactly as on macOS. **Terminal integration is
degraded** — the reasons are below, and they're not fixable with more effort.

> ⚠️ **Unverified on hardware.** Windows support is implemented and unit-tested,
> but has not yet been run against a real Windows machine with a Stream Deck. If
> you try it, please [open an issue](https://github.com/ocgully/Clawdeck/issues)
> — good or bad.

---

## Install

```powershell
git clone https://github.com/ocgully/Clawdeck
cd Clawdeck
npm install
npm run build
npm run install-hooks
npm start
```

Quit the **Elgato Stream Deck** app first — it claims the USB device
exclusively and Clawdeck won't be able to open it.

**No permissions to grant.** Windows doesn't gate HID reads the way macOS does
with Input Monitoring, so presses work immediately.

Run at logon:

```powershell
npm run service:install     # Task Scheduler task, launches with no console window
npm run service:uninstall
```

---

## What works

| Feature | Status |
| ------- | ------ |
| Session dashboard, four colours, spinners | ✅ |
| Button presses | ✅ (no permission needed) |
| Virtual pages, attention key, ambient glow | ✅ |
| Monitor loops | ✅ via PowerShell (`.ps1`) |
| Skills discovery + context view | ✅ |
| Transcript error detection (red) | ✅ |
| Jump to terminal | ⚠️ window only |
| 1-shot run (typing into a session) | ⚠️ best-effort |

---

## Why jump-to-terminal is only window-level

On macOS, AppleScript lets us say "select *this* iTerm session" or "select the
Terminal tab whose tty is X". Windows has no equivalent:

- **Windows Terminal hosts every tab in one window and one process**, and
  exposes **no public API to activate a specific tab**. `WT_SESSION` identifies
  the tab, but there's nothing to hand it to.
- There is no TTY. Clawdeck instead records a **process id** near the session
  (the hook's parent) and, at press time, walks up the process tree to the first
  ancestor that owns a window and raises it with `SetForegroundWindow`.

**Consequence:** several Claude sessions in different tabs of the same Windows
Terminal window all resolve to that one window. Clawdeck brings it forward but
can't pick the tab for you.

### Workaround

Run each Claude session in its **own console window** instead of tabs in one
Windows Terminal. One window per process means focus resolves precisely, and
jump-to-terminal behaves like it does on macOS.

## Why typing is best-effort

Without a `write text` equivalent, Clawdeck focuses the window and then uses
`SendKeys` to type the prompt and press Enter. That means:

- The window must actually take focus first (Clawdeck does this in the same
  script to avoid a race).
- If you click elsewhere mid-send, the keystrokes follow your focus.

SendKeys treats `+ ^ % ~ ( ) { } [ ]` as control characters; Clawdeck escapes
them (unit-tested), so prompts like `fix (a+b)` send as literal text.

---

## Monitor loops on Windows

Monitors run in **PowerShell**. The bundled examples install as `.ps1` to
`~\.claude\clawdeck\monitors\`:

- `slack-check.ps1` — unread-count template
- `git-status.ps1` — dirty-file count

Same output contract as everywhere else:

```powershell
Write-Output "STATUS: warn"
Write-Output "LABEL: 3 unread"
```

See [Configuration](Configuration) for the full protocol.

---

## Implementation notes

| Concern | macOS | Windows |
| ------- | ----- | ------- |
| Hook ↔ daemon IPC | unix socket `~/.claude/clawdeck/deck.sock` | **named pipe** `\\.\pipe\clawdeck` |
| Terminal identity | tty (process-tree walk) | **pid** (resolved to a window at press time) |
| Focus / type | `osascript` | PowerShell + `user32.dll` P/Invoke, `SendKeys` |
| Monitor shell | `$SHELL` | `powershell.exe` |
| Run at login | launchd LaunchAgent | Task Scheduler (ONLOGON) via a VBScript shim |
| Permissions | Input Monitoring + Automation | none |

`node-mac-permissions` is an **optional** dependency (`os: ["darwin"]`), so
`npm install` skips it on Windows rather than failing with `EBADPLATFORM`.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `No Stream Deck found` | Quit the Elgato app; confirm the deck is plugged in |
| Presses do nothing | Unlike macOS this shouldn't happen — [open an issue](https://github.com/ocgully/Clawdeck/issues) |
| Jump focuses the wrong tab | Expected with Windows Terminal tabs — see the workaround above |
| Typing goes to the wrong window | Something stole focus mid-send; retry |
| `npm install` fails building sharp/node-hid | Install the [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), then retry — prebuilt binaries normally avoid this |
| Task doesn't start at logon | `schtasks /Query /TN Clawdeck /V /FO LIST`, and check `~\.claude\clawdeck\daemon.log` |
