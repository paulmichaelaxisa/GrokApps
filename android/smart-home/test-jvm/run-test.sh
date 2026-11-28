#!/usr/bin/env bash
# Compile NetCore.java on a plain JVM and test it against the Python mock HS110 servers.
set -euo pipefail
cd "$(dirname "$0")"
MOCK=../../../smart-home/test/mock_hs110.py
OUT=$(mktemp -d)
javac -d "$OUT" ../android/app/src/main/java/com/paulaxisa/smarthome/NetCore.java NetCoreTest.java
pids=()
start() { python3 "$MOCK" "$@" >/dev/null & pids+=($!); }
start --host 127.0.0.2 --hw 1 --alias "Mock 127.0.0.2"
start --host 127.0.0.3 --hw 2 --alias "Mock 127.0.0.3"
start --host 127.0.0.4 --hw 1 --mode dribble --alias "Mock 127.0.0.4"
start --host 127.0.0.5 --mode newfw
start --host 127.0.0.6 --mode silent
start --host 0.0.0.0 --port 9999 --alias "Mock any" --hw 1 --udp-only
trap 'kill "${pids[@]}" 2>/dev/null || true; rm -rf "$OUT"' EXIT
sleep 1
java -cp "$OUT" NetCoreTest
