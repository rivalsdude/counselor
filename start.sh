#!/bin/sh
set -e
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  exec node scripts/dev-server.js
fi

if [ -x "$HOME/.local/bin/node" ]; then
  exec "$HOME/.local/bin/node" scripts/dev-server.js
fi

echo "Node.js was not found. Ask for help installing it." >&2
exit 1
