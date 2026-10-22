#!/usr/bin/env bash
# Records the HEXHOLD trailer from the real game and writes steam/trailer/:
#   hexhold-trailer.mp4 / .webm / .jpg, hexhold-preview-6s.mp4 / .webm
# Needs Node 20+, ffmpeg, Python 3 + numpy, and a Chromium Playwright can drive.
# Silent and invisible: headless, muted, no window, nothing played aloud.
#   tools/trailer/record_trailer.sh            everything (about 45 minutes)
#   KEEP=1 tools/trailer/record_trailer.sh     keep the work folder for review
#   PORT_A=5610 PORT_B=5611 tools/trailer/record_trailer.sh
#                                              the two recorders' servers on
#                                              other ports (defaults 3419, 3420)
# The shots are filmed by two recorders at once, each playing the whole run
# and filming its half (the run is seeded, so both play the same game).
set -euo pipefail
cd "$(dirname "$0")/../.."
unset ELECTRON_RUN_AS_NODE
PY="${PYTHON:-$(command -v python3 || command -v python)}"
WORK="${WORK:-$(mktemp -d)}"
OUT="steam/trailer"
PORT_A="${PORT_A:-3419}"
PORT_B="${PORT_B:-3420}"
mkdir -p "$OUT" "$WORK/a" "$WORK/b"
[ "${KEEP:-}" = 1 ] || trap 'rm -rf "$WORK"' EXIT

npx vite build >/dev/null
"$PY" tools/trailer/render_music.py
node tools/trailer/record_trailer.mjs --port "$PORT_A" --out "$WORK/a" \
  --only hook_kings,hook_cast,title,undo,write,write_cast --until write_cast > "$WORK/a.log" 2>&1 &
A=$!
node tools/trailer/record_trailer.mjs --port "$PORT_B" --out "$WORK/b" \
  --only omen,worst_wins,finale,end > "$WORK/b.log" 2>&1 &
B=$!
wait $A || { cat "$WORK/a.log"; exit 1; }
wait $B || { cat "$WORK/b.log"; exit 1; }
cat "$WORK/a.log" "$WORK/b.log"
node tools/trailer/render_sfx.mjs "$WORK/a/sfx.json" "$WORK/a/game"
node tools/trailer/render_sfx.mjs "$WORK/b/sfx.json" "$WORK/b/game"
"$PY" tools/trailer/mux_trailer.py "$OUT" "$WORK/a" "$WORK/b"
echo "work folder: $WORK"
