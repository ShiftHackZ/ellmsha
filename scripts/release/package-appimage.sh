#!/usr/bin/env bash
# Wrap the Linux payload already produced by electron-builder. This container
# needs neither FUSE privileges nor access to the Docker socket or user profile.
set -euo pipefail
arch=$1
case "$arch" in
  x64) platform=linux/amd64; unpacked=linux-unpacked ;;
  arm64) platform=linux/arm64; unpacked=linux-arm64-unpacked ;;
  *) echo "Unsupported AppImage architecture: $arch" >&2; exit 1 ;;
esac
ui="$PWD/aionui"
test -x "$ui/out/$unpacked/eLLMsha"
cache="${ELECTRON_BUILDER_CACHE:-$PWD/.data/electron-builder-cache}"
mkdir -p "$cache"
version=$(node -p "require('./aionui/package.json').version")
filename="eLLMsha-$version-linux-$arch.AppImage"
docker run --rm --platform "$platform" --user "$(id -u):$(id -g)" \
  --env HOME=/tmp --env ELECTRON_CACHE=/tmp/electron --env ELECTRON_BUILDER_CACHE=/cache \
  --volume "$ui:/app:ro" --volume "$ui/out:/app/out" --volume "$cache:/cache" \
  --workdir /app node:24.11.0-bookworm@sha256:e5bbac0e9b8a6e3b96a86a82bbbcf4c533a879694fd613ed616bae5116f6f243 \
  node node_modules/electron-builder/cli.js --config packages/desktop/electron-builder.yml \
  --linux AppImage "--$arch" --prepackaged "out/$unpacked" --publish=never \
  "--config.appImage.artifactName=$filename"

# Exercise the self-extractor without FUSE or starting the desktop app.
image="$ui/out/$filename"
test -x "$image"
check=$(mktemp -d)
trap 'rm -rf -- "$check"' EXIT
cd "$check"
"$image" --appimage-extract '*.desktop'
grep -q '^Name=eLLMsha$' squashfs-root/*.desktop
