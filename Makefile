SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

APP := openusage
NPM ?= npm
TAURI := $(NPM) exec tauri --
TARGET_DIR := src-tauri/target/release
BUNDLE_DIR := $(TARGET_DIR)/bundle
DIST_LINUX := dist/linux
LOCAL_TAURI_CONFIG := '{"bundle":{"createUpdaterArtifacts":false}}'

UBUNTU_PACKAGES := libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev clang libclang-dev libc6-dev

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help.
	@awk 'BEGIN {FS = ":.*## "; printf "\nOpenUsage Linux build targets\n\n"} /^[a-zA-Z0-9_.-]+:.*## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: ubuntu-deps
ubuntu-deps: ## Install Ubuntu packages required by Tauri.
	sudo apt update
	sudo apt install -y $(UBUNTU_PACKAGES)

.PHONY: rust
rust: ## Install Rust with rustup if cargo is missing.
	@if command -v cargo >/dev/null 2>&1; then \
		echo "cargo already installed: $$(cargo --version)"; \
	else \
		curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; \
		echo "Rust installed. Restart your shell or run: source $$HOME/.cargo/env"; \
	fi

.PHONY: deps
deps: ## Install JavaScript dependencies with npm.
	$(NPM) install --package-lock=false

.PHONY: setup
setup: ubuntu-deps rust deps ## Install Ubuntu, Rust, and npm dependencies.

.PHONY: doctor
doctor: ## Print Tauri environment diagnostics.
	$(TAURI) info

.PHONY: check-tools
check-tools: ## Fail if required Linux build tools are missing.
	@missing=0; \
	command -v node >/dev/null 2>&1 || { echo "missing: node"; missing=1; }; \
	command -v npm >/dev/null 2>&1 || { echo "missing: npm"; missing=1; }; \
	command -v cargo >/dev/null 2>&1 || { echo "missing: cargo"; missing=1; }; \
	command -v pkg-config >/dev/null 2>&1 || { echo "missing: pkg-config"; missing=1; }; \
	pkg-config --exists webkit2gtk-4.1 || { echo "missing: webkit2gtk-4.1 (install libwebkit2gtk-4.1-dev)"; missing=1; }; \
	pkg-config --exists librsvg-2.0 || { echo "missing: librsvg-2.0 (install librsvg2-dev)"; missing=1; }; \
	pkg-config --exists ayatana-appindicator3-0.1 || { echo "missing: ayatana-appindicator3-0.1 (install libayatana-appindicator3-dev)"; missing=1; }; \
	if [ "$$missing" -ne 0 ]; then echo "Run: make setup"; exit 1; fi

.PHONY: bundle-plugins
bundle-plugins: ## Copy bundled plugins into Tauri resources.
	$(NPM) run bundle:plugins

.PHONY: test
test: ## Run frontend tests.
	$(NPM) exec vitest -- run

.PHONY: typecheck
typecheck: ## Run TypeScript checks.
	$(NPM) exec tsc -- --noEmit

.PHONY: check
check: typecheck test ## Run TypeScript checks and tests.

.PHONY: cargo-check
cargo-check: check-tools ## Run Rust compile checks.
	cd src-tauri && cargo check

.PHONY: dev
dev: check-tools ## Run the Tauri development app.
	$(TAURI) dev

.PHONY: web
web: bundle-plugins ## Build the web frontend only.
	$(NPM) run build

.PHONY: clean-bundles
clean-bundles: ## Trash previous Linux bundle output.
	@if [ -e "$(BUNDLE_DIR)" ]; then if command -v gio >/dev/null 2>&1; then gio trash "$(BUNDLE_DIR)"; elif command -v trash >/dev/null 2>&1; then trash "$(BUNDLE_DIR)"; else echo "missing: gio or trash"; exit 1; fi; fi
	@if [ -e "$(DIST_LINUX)" ]; then if command -v gio >/dev/null 2>&1; then gio trash "$(DIST_LINUX)"; elif command -v trash >/dev/null 2>&1; then trash "$(DIST_LINUX)"; else echo "missing: gio or trash"; exit 1; fi; fi

.PHONY: clean-all
clean-all: ## Trash all generated build output.
	@if [ -e "dist" ]; then if command -v gio >/dev/null 2>&1; then gio trash "dist"; elif command -v trash >/dev/null 2>&1; then trash "dist"; else echo "missing: gio or trash"; exit 1; fi; fi
	@if [ -e "src-tauri/target" ]; then if command -v gio >/dev/null 2>&1; then gio trash "src-tauri/target"; elif command -v trash >/dev/null 2>&1; then trash "src-tauri/target"; else echo "missing: gio or trash"; exit 1; fi; fi

.PHONY: binary
binary: check-tools clean-bundles ## Build a clean raw Ubuntu binary without installers.
	$(TAURI) build --no-bundle --ci
	mkdir -p "$(DIST_LINUX)"
	cp "$(TARGET_DIR)/$(APP)" "$(DIST_LINUX)/$(APP)"
	ls -lh "$(DIST_LINUX)/$(APP)"

.PHONY: package
package: check-tools clean-bundles ## Build Ubuntu .deb and AppImage packages.
	$(TAURI) build --bundles deb,appimage --ci --config $(LOCAL_TAURI_CONFIG)
	mkdir -p "$(DIST_LINUX)"
	cp "$(TARGET_DIR)/$(APP)" "$(DIST_LINUX)/$(APP)"
	cp "$(BUNDLE_DIR)"/deb/*.deb "$(DIST_LINUX)"/
	cp "$(BUNDLE_DIR)"/appimage/*.AppImage "$(DIST_LINUX)"/
	ls -lh "$(DIST_LINUX)"

.PHONY: release
release: check-tools clean-bundles ## Build signed Linux release packages with updater artifacts.
	$(NPM) run build:release -- --ci
	mkdir -p "$(DIST_LINUX)"
	cp "$(TARGET_DIR)/$(APP)" "$(DIST_LINUX)/$(APP)"
	cp "$(BUNDLE_DIR)"/deb/*.deb "$(DIST_LINUX)"/
	cp "$(BUNDLE_DIR)"/appimage/*.AppImage "$(DIST_LINUX)"/
	ls -lh "$(DIST_LINUX)"

.PHONY: install-deb
install-deb: package ## Build and install the .deb locally.
	sudo apt install -y ./$(DIST_LINUX)/*.deb

.PHONY: run-binary
run-binary: binary ## Build and run the raw binary.
	./$(DIST_LINUX)/$(APP)
