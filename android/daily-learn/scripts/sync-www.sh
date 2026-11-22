#!/usr/bin/env bash
# Copy the web app into www/ for Capacitor. www/ is gitignored.
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/sync-www.py"
