#!/usr/bin/env bash
# Clawdeck monitor: latest CI run status for a repo, via the GitHub CLI.
#
# Requires `gh` authenticated. Set REPO_DIR to the checkout you care about,
# or leave it and run the key from any repo you like by editing the command.

set -euo pipefail

REPO_DIR="${CLAWDECK_REPO_DIR:-$PWD}"
cd "$REPO_DIR" 2>/dev/null || { echo "STATUS: info"; echo "LABEL: no repo"; exit 0; }

if ! command -v gh >/dev/null 2>&1; then
  echo "STATUS: info"
  echo "LABEL: no gh cli"
  exit 0
fi

status=$(gh run list --limit 1 --json status,conclusion \
  --jq '.[0] | (.conclusion // .status)' 2>/dev/null || echo "unknown")

case "$status" in
  success)            echo "STATUS: ok";    echo "LABEL: passing" ;;
  failure|cancelled)  echo "STATUS: alert"; echo "LABEL: $status" ;;
  in_progress|queued) echo "STATUS: info";  echo "LABEL: running" ;;
  *)                  echo "STATUS: warn";  echo "LABEL: $status" ;;
esac
