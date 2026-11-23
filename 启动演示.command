#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$project_dir"
if command -v node >/dev/null 2>&1; then
  project_node=$(command -v node)
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  project_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo 'Please install Node.js 24 LTS from https://nodejs.org and try again.' >&2
  exit 1
fi
"$project_node" -e 'if(Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js 24+ required"); process.exit(1); }'
if [ "${1:-}" = '--test' ]; then
  exec "$project_node" --test tests/*.test.mjs
fi
echo 'DriveReach · 外呼与人工协同'
echo 'Default URL: http://127.0.0.1:4197 — keep this terminal open. Ctrl+C to stop.'
exec "$project_node" --env-file-if-exists=.env server.mjs "$@"
