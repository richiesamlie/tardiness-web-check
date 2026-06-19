#!/bin/bash
# ============================================
#   Tardiness Check — Start Script (macOS)
# ============================================
#   Double-click this file to start the app.
# ============================================

cd "$(dirname "$0")"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  ERROR: Node.js is not installed."
  echo "  Please install Node.js 22 or later from:"
  echo "  https://nodejs.org/"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

# First-run: install dependencies
if [ ! -d "node_modules" ]; then
  echo ""
  echo "  First run: installing dependencies..."
  echo ""
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "  ERROR: Failed to install dependencies."
    read -p "Press Enter to exit..."
    exit 1
  fi
fi

# Determine port
#   Priority:  1. PORT env var   2. data/.port file   3. default 3000
#   Edit data/.port to change the port (just the number, e.g. 8080)
if [ -n "$PORT" ]; then
  APP_PORT="$PORT"
elif [ -f "data/.port" ]; then
  APP_PORT=$(cat "data/.port" | tr -d '[:space:]')
  if [ -z "$APP_PORT" ]; then APP_PORT="3000"; fi
else
  APP_PORT="3000"
fi

# Open browser after a short delay (in background)
(sleep 3 && open "http://localhost:${APP_PORT}") &

echo ""
echo "============================================"
echo "  Tardiness Check Server"
echo "============================================"
echo ""
echo "  Browser will open at: http://localhost:${APP_PORT}"
echo ""
echo "  To change the port:"
echo "    - Edit data/.port (just put a number, like 8080)"
echo "    - Or set PORT=8080 before running this script"
echo ""
echo "  To stop: press Ctrl+C"
echo ""
echo "============================================"
echo ""

export PORT="$APP_PORT"
node --no-warnings src/server.js

echo ""
echo "  Server stopped."
read -p "Press Enter to exit..."
