#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# 注入 Homebrew 与常见环境路径，避免从访达双击时缺失 PATH
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

if [ -f "$DIR/node_modules/.bin/electron" ]; then
  "$DIR/node_modules/.bin/electron" .
else
  npm start
fi
