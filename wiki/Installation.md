# Installation

The full step-by-step walkthrough lives in the repo:
**[docs/ONBOARDING.md](https://github.com/ocgully/Clawdeck/blob/main/docs/ONBOARDING.md)**

## The short version

```bash
# 0. Quit the Elgato desktop app — it owns the USB device exclusively.
git clone https://github.com/ocgully/Clawdeck
cd Clawdeck
npm install
npm run build
npm run install-hooks   # wires into ~/.claude/settings.json (idempotent)
npm start
```

Then grant **Input Monitoring** and **Automation** (see
[Troubleshooting](Troubleshooting)) and **fully relaunch** the terminal you run
it from — permissions only apply on relaunch.

## Requirements

- macOS (Ventura+ recommended)
- Node 20+
- A Stream Deck — see [Hardware Support](Hardware-Support)
- Claude Code installed
- **The Elgato desktop app quit or uninstalled**

## Run from login

```bash
npm run service:install     # launchd agent; logs to ~/.claude/clawdeck/daemon.log
npm run service:uninstall
```

Don't also run `npm start` — two processes can't own the deck. The agent runs as
**Node**, so grant Node the two permissions.

## No hardware yet?

```bash
CLAWDECK_DEMO=1 npm start
```
