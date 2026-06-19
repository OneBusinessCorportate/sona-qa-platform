#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs client + server dependencies so tests, type-checks and builds
# work out of the box in a fresh remote container. Idempotent and non-interactive.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

echo "[session-start] installing root + client + server dependencies..."
npm install --no-audit --no-fund
npm run install:all

echo "[session-start] dependencies ready."
