#!/bin/zsh
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8765}"
python3 server.py "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM
sleep 1
open "http://127.0.0.1:${PORT}/"
wait "$SERVER_PID"
