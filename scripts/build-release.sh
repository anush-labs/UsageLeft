#!/bin/bash
set -e

cd "$(dirname "$0")/.."

trash_path() {
  local path="$1"
  if [ ! -e "$path" ]; then
    return
  fi

  if command -v gio >/dev/null 2>&1; then
    gio trash "$path"
  else
    rm -rf "$path"
  fi
}

# Load .env (handles values with spaces)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Read key contents from file path
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$TAURI_SIGNING_PRIVATE_KEY" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY")"
fi

# Clean previous bundle
trash_path src-tauri/target/release/bundle

# Build Ubuntu packages
npm exec tauri -- build --bundles deb,appimage "$@"

echo ""
echo "✓ Build complete! Output:"
ls -la src-tauri/target/release/usageleft 2>/dev/null || true
ls -la src-tauri/target/release/bundle/deb/*.deb 2>/dev/null || true
ls -la src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null || true
