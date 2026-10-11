#!/usr/bin/env bash
# Smoke-test the Linux build (release/linux-unpacked, the Steam Linux depot)
# headless: no display, no sound, nothing on anyone's screen.
#
# Runs test/packaged.mjs (the same harness the Windows build passes) against
# the Linux binary with Chromium's headless Ozone platform. Works in WSL with
# no root: Electron's few libraries a minimal Ubuntu lacks (NSS, ALSA) are
# downloaded as .debs and unpacked into ~/.cache/hexhold-smoke, never
# installed. A Linux Node is fetched the same way if none is on PATH.
#
# From Windows:  wsl -d Ubuntu-24.04 -- bash scripts/linux-smoke.sh [seconds]
# Other window sizes or the quit-time harness, through env (WSL does not
# inherit Windows variables):
#   wsl -d Ubuntu-24.04 -- env HEXHOLD_TEST_SIZE=1920x1080 bash scripts/linux-smoke.sh 60
#   wsl -d Ubuntu-24.04 -- env HEXHOLD_HARNESS=test/quit.mjs bash scripts/linux-smoke.sh 2
# The Next Fest demo (npm run package:demo:linux) instead of the full game:
#   wsl -d Ubuntu-24.04 -- env HEXHOLD_BUILD=release-demo/linux-unpacked bash scripts/linux-smoke.sh 60
# (run from the repo root; MSYS_NO_PATHCONV=1 if launched from Git Bash).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SECONDS_TO_PLAY="${1:-60}"
CACHE="${HOME}/.cache/hexhold-smoke"
mkdir -p "$CACHE"

BUILD="${HEXHOLD_BUILD:-release/linux-unpacked}"
[ -f "$REPO/$BUILD/hexhold" ] || {
  echo "No Linux build in $BUILD: run npx electron-builder --linux dir (or npm run package:demo:linux) first." >&2; exit 2; }
# The harness fails if it finds the other build than the one asked for.
case "$BUILD" in *demo*) export HEXHOLD_EXPECT_DEMO=1;; *) export HEXHOLD_EXPECT_DEMO=0;; esac

# A copy on the Linux filesystem: /mnt/c has no execute bits to trust and is
# slow, and the build must run from somewhere it really could be installed.
APP="$CACHE/$(echo "$BUILD" | tr / -)"
rm -rf "$APP"
cp -r "$REPO/$BUILD" "$APP"
chmod +x "$APP/hexhold" "$APP/chrome_crashpad_handler" "$APP/chrome-sandbox"

# Libraries Electron needs that a minimal WSL Ubuntu lacks.
LIBROOT="$CACHE/libs"
if [ ! -f "$LIBROOT/usr/lib/x86_64-linux-gnu/libnss3.so" ] || [ ! -f "$LIBROOT/usr/lib/x86_64-linux-gnu/libasound.so.2" ]; then
  (cd "$CACHE" && rm -f ./*.deb
   apt-get download libnss3 libnspr4 >/dev/null 2>&1 || true
   alsa=$(curl -s http://archive.ubuntu.com/ubuntu/pool/main/a/alsa-lib/ | grep -o 'libasound2t64_1\.2\.11-1ubuntu0[^"]*_amd64\.deb' | sort -u | tail -1)
   [ -n "$alsa" ] && curl -s -O "http://archive.ubuntu.com/ubuntu/pool/main/a/alsa-lib/$alsa"
   for d in ./*.deb; do dpkg -x "$d" "$LIBROOT"; done)
fi
export LD_LIBRARY_PATH="$LIBROOT/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

missing=$(ldd "$APP/hexhold" | grep 'not found' || true)
if [ -n "$missing" ]; then echo "Missing libraries:"; echo "$missing"; exit 3; fi

# A Linux Node for the harness (Playwright is plain JS in the repo's node_modules).
NODE="$(command -v node || true)"
case "$NODE" in ""|/mnt/*) NODE="";; esac
if [ -z "$NODE" ]; then
  NODE="$CACHE/node/bin/node"
  if [ ! -x "$NODE" ]; then
    v=$(curl -s https://nodejs.org/dist/latest-v22.x/ | grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -1)
    mkdir -p "$CACHE/node"
    curl -s "https://nodejs.org/dist/latest-v22.x/$v" | tar -xJ -C "$CACHE/node" --strip-components=1
  fi
fi

# No display of any kind: WSLg would otherwise put a window on the desktop.
unset DISPLAY WAYLAND_DISPLAY ELECTRON_RUN_AS_NODE
cd "$REPO"
# GL through SwiftShader. Headless Ozone has no EGL display, so without these
# the GPU process fails to start ("Exiting GPU process due to errors during
# initialization") and about one launch in 20 never draws its first frame:
# the renderer's main thread waits forever, no window, every harness step
# times out. Measured 2026-10-11 by launching the build with no Playwright
# attached, 60 launches each: default 3 stuck, --disable-webgl 1 stuck,
# SwiftShader 0 (and 0 in the harness runs since). A machine with a GPU, a
# Deck included, starts its GPU process and never takes that path. This also
# draws the WebGL menu backdrop instead of its no-GL fallback.
HEXHOLD_EXE="$APP/hexhold" HEXHOLD_TEST_SIZE="${HEXHOLD_TEST_SIZE:-1280x800}" \
HEXHOLD_EXTRA_ARGS="--no-sandbox --ozone-platform=headless --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader" \
  "$NODE" "${HEXHOLD_HARNESS:-test/packaged.mjs}" "$SECONDS_TO_PLAY"
