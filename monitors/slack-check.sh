#!/usr/bin/env bash
# ClaudeDeck monitor: unread Slack messages.
#
# This is a TEMPLATE. Point it at however you actually read Slack — the Slack
# CLI, a webhook count, an API call with a token in your keychain, etc. The
# only contract ClaudeDeck cares about is the two directive lines below.
#
# Output protocol:
#   STATUS: ok | warn | alert | info   -> tile color (green/yellow/red/blue)
#   LABEL:  <short text>                -> tile caption (<= ~14 chars)
#
# Assign this script to any Monitor Loop key and set the interval (e.g. 600s).

set -euo pipefail

# --- replace this block with your real check -------------------------------
# Example using a hypothetical `slack` CLI that prints an unread count:
#   unread=$(slack unread --count 2>/dev/null || echo 0)
unread="${CLAUDEDECK_FAKE_UNREAD:-0}"   # demo default so the tile works out of the box
# ---------------------------------------------------------------------------

if [[ "$unread" -gt 0 ]]; then
  echo "STATUS: warn"
  echo "LABEL: $unread unread"
else
  echo "STATUS: ok"
  echo "LABEL: inbox zero"
fi
