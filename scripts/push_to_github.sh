#!/usr/bin/env bash
# One-shot: create private GitHub repo and push.
# Requires: gh CLI authenticated (`gh auth login`).
set -euo pipefail

REPO_NAME="${1:-candidate-assessment-platform}"
VISIBILITY="${2:---private}"  # or --public

if ! command -v gh >/dev/null; then
  echo "gh CLI not found. Install: https://cli.github.com/" >&2
  exit 1
fi

git add -A
git commit -m "feat(db): initial schema, telemetry partitioning, audit hash-chain" || true
gh repo create "$REPO_NAME" "$VISIBILITY" --source=. --remote=origin --push
