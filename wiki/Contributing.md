# Contributing

Clawdeck is MIT and built to be a community project. Issues and PRs welcome.

## Dev setup

```bash
git clone https://github.com/ocgully/Clawdeck
cd Clawdeck
npm install
npm run build     # bundle -> dist/clawdeck.mjs
npm run watch     # rebuild on change
npm test          # 34 assertions, no hardware needed
npm start
```

`CLAWDECK_DEMO=1 npm start` seeds fake sessions so you can work on the UI without
driving real Claude sessions.

## Tests

`npm test` bundles `scripts/smoke.ts` and runs it. It covers the parts that don't
need hardware: the unix socket, the session store and status mapping, sticky
errors, view paging, the SVG icon engine, the transcript watcher, suggestion
parsing, and layout generation for both Neo and MK.2 geometry.

**Please add assertions for behaviour you change** — especially layout generation
(easy to break for non-grid decks like the Neo) and status transitions.

Things a test can't cover, so verify by hand if you touch them:

- actual rendering to hardware
- button input (needs Input Monitoring)
- terminal focus / text injection (needs Automation)

## Architecture

Read **[Architecture](Architecture)** first. The short version:

- `src/standalone/device.ts` is the **only** file that touches the HID library.
  Keep hardware specifics there.
- Never assume a dense key grid — use the device's reported `row`/`column`
  (the Neo will bite you). See [Hardware Support](Hardware-Support).
- Tile faces are SVG strings in `src/icons/render.ts`; nothing else should build
  images.
- The daemon must never block: hooks are fire-and-forget, and monitor commands
  are timed out.

## Conventions

- TypeScript, strict. No new runtime deps without a good reason — the icon engine
  is pure strings specifically to avoid native builds (`sharp` and `node-hid` are
  the only unavoidable ones).
- Comments explain **why**, not what.
- Commits: imperative subject, and say what changed and why in the body.

## Good first issues

- Stream Deck+ dial support (keys already work; dials aren't mapped)
- Windows / Linux terminal focus (`integrations/terminal.ts` is macOS-only)
- A signed `.app` bundle so permissions attach to a real bundle id
- Token/cost readout per session tile
