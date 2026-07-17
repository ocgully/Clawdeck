# Monitor scripts

A **Monitor Loop** key runs a command on a timer (and when you press it) and
paints its result onto the tile. Any script or one-liner works — the only
contract is the output protocol.

## Output protocol

Print either or both directive lines anywhere in stdout:

```
STATUS: ok | warn | alert | info
LABEL:  short caption text
```

| STATUS  | Color  | Use for            |
| ------- | ------ | ------------------ |
| `ok`    | green  | all good           |
| `warn`  | yellow | needs a look soon  |
| `alert` | red    | needs you now      |
| `info`  | blue   | neutral / counts   |

No `STATUS:` line? Then **exit 0 → green**, **non-zero → red**, and the first
plain stdout line (or first stderr line on failure) becomes the caption.

## Included examples

- **`slack-check.sh`** — template for an unread-Slack count. Fill in your real
  source (Slack CLI / API / webhook). Your 10-minute inbox check.
- **`ci-status.sh`** — latest CI conclusion for a repo via `gh run list`.

## Wiring one up

1. Drag a **Monitor Loop** key onto your deck.
2. Open its settings, set a **Title**, paste the **Command** (e.g.
   `~/.claude/clawdeck/monitors/slack-check.sh`), and an interval in seconds.
3. Press the key any time to run it on demand.

`npm run install-hooks` copies these examples to
`~/.claude/clawdeck/monitors/` for you.
