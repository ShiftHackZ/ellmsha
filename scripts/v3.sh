#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TDAI="$ROOT/tencentdb-agent-memory/deploy/global-images"
export ENV_FILE="$ROOT/.env"
export MEMORY_CORE_ADMIN_KEY_FILE="$ROOT/.data/tencentdb/admin-key"
export MEMORY_CORE_CONFIG_DIR="$ROOT/.data/tencentdb/core-config"
export PROXY_CONFIG_DIR="$ROOT/.data/tencentdb/proxy-config"

usage() {
  echo "Usage: scripts/v3.sh init|doctor|computer-use-doctor|up|down|status|desktop-dev|desktop-build|desktop" >&2
  exit 2
}

need_env() {
  [[ -f "$ENV_FILE" ]] || { echo "Run scripts/v3.sh init, then edit .env" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  local required=(PROXY_UPSTREAM_URL PROXY_UPSTREAM_API_KEY PROXY_UPSTREAM_MODEL)
  if [[ "${AION_LLM_REQUIRE_CONTEXT:-0}" != 1 ]]; then
    required+=(MEMORY_LLM_BASE_URL MEMORY_LLM_API_KEY MEMORY_LLM_MODEL)
  fi
  for name in "${required[@]}"; do
    [[ -n "${!name:-}" && "${!name}" != REPLACE_ME ]] || { echo "Set $name in .env" >&2; exit 1; }
  done
}

build_backend() {
  local profile="${1:-dev}"
  if ! command -v cargo >/dev/null; then
    local rust_arch="$(uname -m)"
    [[ "$rust_arch" != arm64 ]] || rust_arch=aarch64
    export PATH="$HOME/.cargo/bin:$HOME/.rustup/toolchains/stable-$rust_arch-apple-darwin/bin:$PATH"
  fi
  command -v cargo >/dev/null || { echo "Install Rust to build the local aioncore fork" >&2; exit 1; }
  [[ -f "$ROOT/aioncore/Cargo.toml" ]] || { echo "Initialize the aioncore submodule first" >&2; exit 1; }
  [[ -f "$ROOT/aionrs/Cargo.toml" ]] || { echo "Initialize the local aionrs source checkout first (see README)" >&2; exit 1; }
  export CARGO_HOME="${ELLM_SHA_CARGO_HOME:-$ROOT/.data/cargo}"
  (cd "$ROOT/aioncore" && cargo build --locked --profile "$profile" -p aionui-app --bin aioncore)
  local output="$profile"
  [[ "$profile" != dev ]] || output=debug
  export AIONUI_BACKEND_BIN="$ROOT/aioncore/target/$output/aioncore"
  export AIONUI_BACKEND_LOCAL_BINARY="$AIONUI_BACKEND_BIN"
}

prepare_mobile_mcp() {
  node "$ROOT/scripts/prepare-mobile-mcp.js" "$@"
}

prepare_chrome_devtools_mcp() {
  node "$ROOT/scripts/prepare-chrome-devtools-mcp.js" "$@"
}

prepare_open_computer_use() {
  node "$ROOT/scripts/prepare-open-computer-use.js" "$@"
}

case "${1:-}" in
  init)
    mkdir -p "$ROOT/.data/tencentdb" "$ROOT/workspaces"
    if [[ ! -f "$ENV_FILE" ]]; then
      cp "$ROOT/.env.example" "$ENV_FILE"
      chmod 600 "$ENV_FILE"
    fi
    echo "Edit $ENV_FILE: configure the embedding service and optional proxy; generation follows the chat model."
    ;;
  doctor)
    command -v docker >/dev/null || { echo "Docker CLI missing" >&2; exit 1; }
    docker info >/dev/null || { echo "Docker daemon unavailable" >&2; exit 1; }
    [[ -f "$TDAI/start-memory-core.sh" && -f "$ROOT/aionui/package.json" ]] || { echo "Initialize Git submodules first" >&2; exit 1; }
    need_env
    docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.yaml" config --quiet
    echo "Local configuration is valid. Live LLM connectivity is checked by the upstream TencentDB verify script."
    ;;
  computer-use-doctor)
    prepare_open_computer_use --doctor
    ;;
  up)
    "$0" doctor
    prepare_mobile_mcp --verify-only
    prepare_chrome_devtools_mcp --verify-only
    prepare_open_computer_use --verify-only
    mkdir -p "$ROOT/.data/tencentdb" "$ROOT/workspaces"
    "$TDAI/verify.sh" --skip-llm
    "$TDAI/start-memory-core.sh"
    "$TDAI/start-memory-hub.sh"
    PROXY_FULL_STACK=1 "$TDAI/start-proxy.sh"
    python3 "$ROOT/scripts/bootstrap-memory.py"
    docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.yaml" up -d --build aionui
    echo "AionUi: http://127.0.0.1:${AIONUI_PORT:-3000}  Memory panel: http://127.0.0.1:${PANEL_PORT:-8125}"
    ;;
  down)
    docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.yaml" down
    "$TDAI/stop-all.sh"
    ;;
  status)
    docker ps --filter 'name=tdai-' --filter 'name=ellmsha_v3-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  desktop-dev)
    [[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "Desktop dev is configured for macOS arm64" >&2; exit 1; }
    node "$ROOT/aionui/scripts/memory/prepare.cjs"
    prepare_mobile_mcp
    prepare_chrome_devtools_mcp
    prepare_open_computer_use
    build_backend dev
    core_dir="$ROOT/aionui/resources/bundled-aioncore/darwin-arm64"
    electron_dir="$ROOT/aionui/node_modules/electron"
    if [[ ! -e "$electron_dir/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework" ]]; then
      cache_zip="$(rg --files "$HOME/Library/Caches/electron" 2>/dev/null | rg '/electron-v[^/]+-darwin-arm64\.zip$' | head -1 || true)"
      [[ -n "$cache_zip" ]] || { echo "Electron runtime missing; install AionUi dependencies" >&2; exit 1; }
      unzip -oq "$cache_zip" -d "$electron_dir/dist"
    fi
    if [[ ! -f "$electron_dir/path.txt" && -x "$electron_dir/dist/Electron.app/Contents/MacOS/Electron" ]]; then
      printf 'Electron.app/Contents/MacOS/Electron' > "$electron_dir/path.txt"
    fi
    [[ -f "$electron_dir/path.txt" ]] || { echo "Install AionUi dependencies before desktop-dev" >&2; exit 1; }
    dev_dist="$ROOT/.data/ellmsha-electron"
    dev_app="$dev_dist/eLLMsha.app"
    if [[ ! -d "$dev_app" ]]; then
      mkdir -p "$dev_dist"
      cp -cR "$electron_dir/dist/Electron.app" "$dev_app"
      mv "$dev_app/Contents/MacOS/Electron" "$dev_app/Contents/MacOS/eLLMsha"
    fi
    /usr/libexec/PlistBuddy -c 'Set :CFBundleName eLLMsha' "$dev_app/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName eLLMsha' "$dev_app/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c 'Add :CFBundleDisplayName string eLLMsha' "$dev_app/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.ellmsha.dev' "$dev_app/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleExecutable eLLMsha' "$dev_app/Contents/Info.plist"
    app_version="$(node -p "require('$ROOT/aionui/packages/desktop/src/common/branding/release.json').version")"
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $app_version" "$dev_app/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${app_version}.$(node -p "require('$ROOT/aionui/packages/desktop/src/common/branding/release.json').patch")" "$dev_app/Contents/Info.plist"
    cp "$ROOT/aionui/resources/app.icns" "$dev_app/Contents/Resources/electron.icns"
    export ELECTRON_EXEC_PATH="$dev_app/Contents/MacOS/eLLMsha"
    user_data="${ELLM_SHA_USER_DATA_DIR:-$HOME/Library/Application Support/eLLMsha Desktop}"
    mkdir -p "$user_data"
    export PATH="$core_dir:$PATH"
    export ELLM_SHA_USER_DATA_DIR="$user_data"
    export ELLM_SHA_BMAD_SKILLS_DIR="$ROOT/bmad-method/ellmsha-skills"
    export ELLM_SHA_PONYTAIL_SKILLS_DIR="$ROOT/ponytail/skills"
    unset AIONUI_MULTI_INSTANCE
    export AIONUI_DISABLE_AUTO_UPDATE=1
    panel_port="$(awk -F= '$1 == "PANEL_PORT" {print $2}' "$ENV_FILE" 2>/dev/null | tail -1)"
    export VITE_TDAI_PANEL_URL="http://127.0.0.1:${panel_port:-8125}/"
    cd "$ROOT/aionui"
    if command -v bun >/dev/null; then
      exec bun run dev
    fi
    exec ./node_modules/.bin/electron-vite dev --config packages/desktop/electron.vite.config.ts
    ;;
  desktop-build)
    [[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "The pinned desktop release is configured for macOS arm64" >&2; exit 1; }
    [[ -x "$ROOT/aionui/node_modules/.bin/electron-builder" ]] || { echo "Install AionUi dependencies before desktop-build" >&2; exit 1; }
    prepare_mobile_mcp
    prepare_chrome_devtools_mcp
    prepare_open_computer_use
    build_backend release
    (cd "$ROOT/aionui" && node scripts/build-with-builder.js arm64 --mac --arm64 --skip-native)
    ;;
  desktop)
    app="$ROOT/aionui/out/mac-arm64/eLLMsha.app"
    user_data="${ELLM_SHA_USER_DATA_DIR:-$HOME/Library/Application Support/eLLMsha Desktop}"
    [[ -d "$app" ]] || { echo "Build the fork first: scripts/v3.sh desktop-build" >&2; exit 1; }
    mkdir -p "$user_data"
    open -a "$app" --env "ELLM_SHA_USER_DATA_DIR=$user_data" --env "ELLM_SHA_BMAD_SKILLS_DIR=$ROOT/bmad-method/ellmsha-skills" --env "ELLM_SHA_PONYTAIL_SKILLS_DIR=$ROOT/ponytail/skills"
    ;;
  *) usage ;;
esac
