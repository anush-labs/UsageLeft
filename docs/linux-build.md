# Linux Build Guide

OpenUsage is built for Ubuntu with Tauri v2.

Official Tauri prerequisites: <https://v2.tauri.app/start/prerequisites/>

## Ubuntu Setup

Install system packages:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  clang \
  libclang-dev \
  libc6-dev
```

Install Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Install app dependencies:

```bash
npm install --package-lock=false
```

Or run all setup through Make:

```bash
make setup
```

## Build

If `rquickjs-sys` fails with `fatal error: 'stdbool.h' file not found`, install the updated packages above. Older local setups may be missing `clang`, `libclang-dev`, or `libc6-dev`.

If Cargo was just installed and `make` cannot find it, run:

```bash
source "$HOME/.cargo/env"
```

Run checks:

```bash
make check
make cargo-check
```

Build the raw Ubuntu binary:

```bash
make binary
```

Output:

```text
dist/linux/openusage
```

Build installable packages:

```bash
make package
```

`make package` is for local Ubuntu builds and does not require updater signing keys.

Output:

```text
dist/linux/openusage
dist/linux/*.deb
dist/linux/*.AppImage
```

Build signed release packages with updater artifacts:

```bash
export TAURI_SIGNING_PRIVATE_KEY=/path/to/private.key
make release
```

Install the `.deb` locally:

```bash
make install-deb
```

## Development

Run the app in development mode:

```bash
make dev
```

Run diagnostics:

```bash
make doctor
```

## Ubuntu Status Indicator

The app runs from the Ubuntu status indicator. The indicator menu shows enabled agents, usage left or used, reset timing, and quick actions.

If the indicator icon does not appear, confirm these are installed:

```bash
sudo apt install -y libayatana-appindicator3-dev
```

GNOME may also need an AppIndicator extension enabled, depending on the desktop image.
