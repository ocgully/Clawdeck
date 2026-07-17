# Hardware Support

| Device | Keys | Key size | Status |
| ------ | ---- | -------- | ------ |
| Stream Deck **MK.2 / Original V2** | 15 (5×3) | 72px | ✅ hardware-validated |
| Stream Deck **XL** | 32 (8×4) | 96px | ✅ layout auto-adapts |
| Stream Deck **Neo** | 8 (4×2) + 2 side buttons + LCD bar | 96px | ✅ implemented, unit-tested |
| Stream Deck **Mini** | 6 (3×2) | 80px | ✅ layout auto-adapts |
| Stream Deck **+** (dials) | 8 + 4 dials | 120px | ⚠️ keys work; dials not yet mapped |

## How layouts adapt

Clawdeck never assumes a dense grid. It reads the device's own `CONTROLS` and
builds a layout from **real `row`/`column` positions**, because index math breaks
on decks like the Neo.

### Tall decks (MK.2, XL) — no dedicated side buttons

```
rightmost column : page-up (top) · attention (middle) · page-down (bottom)
next column left : Slack monitor (top) · Skills (below)
everything else  : sessions
```

### Stream Deck Neo

The Neo is **not** a 4×2 grid. Its controls are:

- **8 LCD keys**, indices `0–7`, a 4×2 grid at 96×96 — drawable
- **2 extra buttons**, indices `8` and `9`, sitting on **row 2** at columns 0 and
  3 — `feedbackType: 'rgb'`, **no `pixelSize`**. They can be lit a solid colour
  but **cannot display an image**.
- **1 LCD segment** (the info bar), 248×58, spanning between them.

Naive `index % columns` math would place index 9 at column 1 instead of its real
column 3. Clawdeck uses the reported positions instead.

The generated layout:

```
┌────────┬────────┬────────┬───────────┐
│ session│ session│ session│ attention │   row 0
├────────┼────────┼────────┼───────────┤
│ session│ session│ session│  skills   │   row 1
└────────┴────────┴────────┴───────────┘
  ( ◀ )        [ info bar ]        ( ▶ )    row 2  ← RGB side buttons
  page-down                        page-up
```

- **Side buttons → pagers.** They're physically placed like page controls, and
  since they're colour-only they carry the *ambient glow* — they take on the
  colour of your most urgent session.
- **Right column → attention + skills.**
- **Remaining 6 keys → sessions.**
- **Info bar → live tally**: current view on the left, counts per status on the
  right (e.g. `● 3  ● 1  ● 2`).

No Slack monitor by default on Neo — with only 8 drawable keys, session slots are
worth more. Add one by editing [`layout.json`](Configuration).

### RGB-only keys

Any key the device reports without a `pixelSize` is treated as colour-only. The
controller derives a representative colour from its role:

| Role | Colour |
| ---- | ------ |
| pager | most-urgent session's colour (dim slate when all idle) |
| attention | urgent session's colour, else dim green |
| session | that session's status colour |
| skills | violet when sessions exist, else off |

## Adding a device

Support comes from `@elgato-stream-deck/node`, so new models generally work with
no code change — geometry is read from the device. If a layout comes out wrong,
open an issue with the output of:

```bash
node -e "import('@elgato-stream-deck/node').then(async m=>{
  const d=(await m.listStreamDecks())[0];
  const sd=await m.openStreamDeck(d.path);
  console.log(sd.MODEL, JSON.stringify(sd.CONTROLS,null,1));
  await sd.close();
})"
```
