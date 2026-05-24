#!/bin/bash
set -euo pipefail

# Re-applies the banana-claude MCP server config on each new session.
# The Gemini API key is read from the GOOGLE_AI_API_KEY environment variable
# so it never has to live in the repo. Set it in your Claude Code on the web
# environment variables (or export it locally).

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SKILL_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/skills/banana"

if [ ! -f "$SKILL_DIR/scripts/setup_mcp.py" ]; then
  echo "[banana hook] skill not found at $SKILL_DIR -- skipping" >&2
  exit 0
fi

if [ -z "${GOOGLE_AI_API_KEY:-}" ]; then
  echo "[banana hook] GOOGLE_AI_API_KEY not set -- skipping MCP setup." >&2
  echo "[banana hook] Add it to your Claude Code environment variables to enable nanobanana-mcp." >&2
  exit 0
fi

python3 "$SKILL_DIR/scripts/setup_mcp.py" --key "$GOOGLE_AI_API_KEY" >&2
mkdir -p "$HOME/.banana/presets"
echo "[banana hook] nanobanana-mcp configured." >&2
