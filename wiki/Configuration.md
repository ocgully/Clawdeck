# Configuration

Everything Clawdeck keeps lives under `~/.claude/clawdeck/`:

| Path | What |
| ---- | ---- |
| `layout.json` | which key does what |
| `monitors/` | your monitor scripts |
| `skill-usage.json` | how often you run each skill (drives ranking) |
| `deck.sock` | the unix socket hooks talk to |
| `daemon.log` / `daemon.err.log` | launchd service logs |

---

## layout.json

Generated on first run to match your deck. One entry per key, in device index
order. Edit and restart the daemon to apply.

```json
{
  "version": 3,
  "keys": [
    { "kind": "session" },
    { "kind": "monitor", "title": "Slack",
      "command": "/Users/you/.claude/clawdeck/monitors/slack-check.sh",
      "intervalSec": 600 },
    { "kind": "skills" },
    { "kind": "attention" },
    { "kind": "pager", "direction": "next" },
    { "kind": "pager", "direction": "prev" },
    { "kind": "empty" }
  ]
}
```

### Roles

| `kind` | Behaviour |
| ------ | --------- |
| `session` | Auto-fills with a live session. Press = jump to its terminal. Double-tap = context view. |
| `attention` | Dark when calm, pulses when a session needs you. Press = jump to the most urgent one. |
| `pager` | Cycles dashboard pages. `direction`: `"next"` (up) or `"prev"` (down). Border carries the ambient glow. |
| `monitor` | Runs `command` every `intervalSec`. Press = run now. |
| `skills` | Opens the context view for the selected session. Hidden when no sessions exist. |
| `empty` | Blank. |

Delete the file to regenerate the default. Clawdeck also regenerates it
automatically if `version` is older than the current schema or the key count
doesn't match your deck.

---

## Monitor loops

Any command, on a timer. The contract is two optional stdout directives:

```
STATUS: ok | warn | alert | info     # green | yellow | red | blue
LABEL:  short caption                # keep it under ~14 chars
```

No `STATUS` line? **exit 0 → green**, **non-zero → red**, and the first plain
stdout line (or first stderr line on failure) becomes the caption.

Example (`monitors/slack-check.sh`):

```bash
#!/usr/bin/env bash
unread=$(slack unread --count 2>/dev/null || echo 0)
if [[ "$unread" -gt 0 ]]; then
  echo "STATUS: warn"; echo "LABEL: $unread unread"
else
  echo "STATUS: ok";   echo "LABEL: inbox zero"
fi
```

Commands run in your login shell from `$HOME` with a 60s timeout. Press the key
any time to run it on demand.

---

## The context view

**Double-tap a session tile** (or press **Skills**) to drill into a session. The
deck becomes a list of things you can fire at it:

| Colour | Type | Source |
| ------ | ---- | ------ |
| 🔵 blue | quick actions | fixed: Continue, Run tests, Commit, Explain, Fix errors |
| 🟡 amber | suggestions | parsed from that session's last reply |
| 🟣 violet | skills | every discoverable skill, usage-ranked |

Press one → it's typed into that session's terminal and submitted, then you drop
back to the dashboard to watch it run. **Back** is top-right; **more** pages long
lists.

### Skills

Discovered from:

- `~/.claude/plugins/**/skills/*/SKILL.md` (plugin skills)
- `~/.claude/skills/*/SKILL.md` (your skills)
- `<session cwd>/.claude/skills/*/SKILL.md` (project-local)

The frontmatter `name:` is the slash command (`gsd:plan-phase` → `/gsd:plan-phase`).

Ranking: **most-run first** (tracked in `skill-usage.json` as you use them), then
most-recent, then alphabetical. Run a skill a few times and it climbs to page one.

### Suggestions

Best-effort. Clawdeck reads the last assistant message in the transcript and
pulls out bulleted/numbered options and direct questions. If Claude's last reply
didn't offer anything, you simply get quick actions + skills — that's expected,
not a bug.

---

## Environment variables

| Var | Effect |
| --- | ------ |
| `CLAWDECK_DEMO=1` | Seed fake sessions (2 pages, one waiting, two errored) so you can explore without real sessions |
| `CLAWDECK_REPO_DIR` | Used by the bundled `ci-status.sh` monitor |
