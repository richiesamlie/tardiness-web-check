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

# Open browser after a short delay (in background)
(sleep 3 && open "http://localhost:3000") &

echo ""
echo "============================================"
echo "  Tardiness Check Server"
echo "============================================"
echo ""
echo "  Browser will open at: http://localhost:3000"
echo "  To stop: press Ctrl+C"
echo ""
echo "============================================"
echo ""

node --no-warnings src/server.js

echo ""
echo "  Server stopped."
read -p "Press Enter to exit..."
