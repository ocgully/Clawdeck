#!/usr/bin/env bash
# Publish wiki/*.md to the GitHub wiki (a separate git repo).
#
# ONE-TIME SETUP: GitHub only creates the wiki repo after the first page is
# saved in the web UI. Go to https://github.com/ocgully/Clawdeck/wiki, click
# "Create the first page", save anything, then run this script — it overwrites
# that placeholder with the real pages.
#
# Usage: ./scripts/publish-wiki.sh

set -euo pipefail

REPO="${CLAWDECK_WIKI_REMOTE:-git@github.com:ocgully/Clawdeck.wiki.git}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/wiki"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! git ls-remote "$REPO" >/dev/null 2>&1; then
  echo "✗ Wiki repo not found: $REPO"
  echo "  Initialize it first: https://github.com/ocgully/Clawdeck/wiki → 'Create the first page' → Save."
  exit 1
fi

git clone --quiet "$REPO" "$TMP/wiki"
cp "$SRC"/*.md "$TMP/wiki/"

cd "$TMP/wiki"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "✓ Wiki already up to date."
  exit 0
fi

git add -A
git commit --quiet -m "docs: sync wiki from repo wiki/"
git push --quiet origin HEAD
echo "✓ Published $(ls -1 "$SRC"/*.md | wc -l | tr -d ' ') pages to https://github.com/ocgully/Clawdeck/wiki"
