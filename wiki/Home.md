# Clawdeck Wiki 🐾

**Your Elgato Stream Deck, turned into live mission-control for Claude Code.**

Clawdeck is a standalone macOS daemon that owns your Stream Deck over USB HID —
it *replaces* the Elgato desktop app rather than running inside it. Every key
becomes a window on a running Claude Code session.

## Start here

| Page | What's in it |
| ---- | ------------ |
| **[Installation](Installation)** | Clone → run, in ~10 minutes |
| **[Troubleshooting](Troubleshooting)** | The two macOS permissions that fail silently, and everything else |
| **[Configuration](Configuration)** | `layout.json`, monitor loops, skills |
| **[Hardware Support](Hardware-Support)** | MK.2, XL, Neo, Mini — and how geometry is handled |
| **[Windows](Windows)** | Windows 11 support, and the terminal-focus caveat |
| **[Architecture](Architecture)** | How status is derived, and why it's not terminal scraping |
| **[Contributing](Contributing)** | Dev setup, tests, PRs |

## The idea in one picture

```
Claude Code hooks ──(unix socket)──► Clawdeck daemon ──(USB HID)──► your deck
        ▲                                   │
        └────────(osascript: focus/type)────┘
```

Claude Code already broadcasts its lifecycle. Clawdeck listens, colours a key per
session, and gives you a way back in — press to jump to that terminal, double-tap
to fire a skill at it.

## The four colours

| Colour | Meaning |
| ------ | ------- |
| ⚪ grey | idle — finished its turn |
| 🟢 green | actively working |
| 🟡 yellow | needs you (permission / question) |
| 🔴 red | alive but **stuck**: rate limit, overload, timeout |

Red deliberately does **not** mean "crashed" — a crash just ends the session. See
[Architecture](Architecture#error-detection) for how stuck-vs-transient is told apart.

## Project

- Source: <https://github.com/ocgully/Clawdeck>
- License: MIT
