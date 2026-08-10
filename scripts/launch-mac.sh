#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."

export VITE_DEV_SERVER_URL="http://127.0.0.1:5173"
unset ELECTRON_RUN_AS_NODE

if ! curl -fsS "$VITE_DEV_SERVER_URL" >/dev/null 2>&1; then
  echo "[Skill Mesh] starting Vite..."
  npx vite --host 127.0.0.1 --port 5173 --strictPort >/tmp/skill-mesh-vite.log 2>&1 &
  for i in {1..60}; do
    if curl -fsS "$VITE_DEV_SERVER_URL" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

if ! curl -fsS "$VITE_DEV_SERVER_URL" >/dev/null 2>&1; then
  echo "[Skill Mesh] Vite failed to start. See /tmp/skill-mesh-vite.log"
  exit 1
fi

echo "[Skill Mesh] opening Electron window..."
exec npx electron .
