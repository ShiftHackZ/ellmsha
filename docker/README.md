# Published Linux images

The release workflow builds **linux/amd64** images from one exact root commit and
its recorded fork commits. ARM64 images are not part of this release pipeline.
The web image contains AionUI, AionCore and AionRS. MemoryCore and the combined
MemoryPanel/MemoryKnowledge hub run separately; the proxy is optional.

| Service | GHCR package |
| --- | --- |
| Web and agents | `ghcr.io/shifthackz/ellmsha-web` |
| MemoryCore | `ghcr.io/shifthackz/ellmsha-memory-core` |
| Memory hub | `ghcr.io/shifthackz/ellmsha-memory-hub` |
| Optional proxy | `ghcr.io/shifthackz/ellmsha-memory-proxy` |

Each package receives the release version (without `v`) and `sha-<full-root-sha>`
tags. `images.json`, attached to the release, records the immutable digest of each
image and the source revision. Deploy by digest for reproducibility. An existing
version or SHA tag is never overwritten: a retry may reuse it only after checking
its version/source/platform labels and agreement between both tags. `latest` is
promoted separately **after** the matching stable GitHub release is published
and confirmed as GitHub's current latest release (an older manifest cannot roll
`latest` back).
Base image versions and package locks are pinned; Debian package repositories can
change, so rebuilding the same source is not a promise of identical image bytes.

## Deploy an existing initialized stack

Use the root checkout for the selected release (scripts/configuration only; no
local compilation is required). Back up `.data` and the named memory volumes
with writers stopped. Keep the same project name, volume names, private config
files and workspace mounts as the current VPS installation.

Set `ELLM_SHA_VERSION` in the existing private `.env` to the published version.
Review any existing `MEMORY_CORE_IMAGE`, `MEMORY_HUB_IMAGE` and `PROXY_IMAGE`
overrides: old `:local` values override the release defaults. For exact digests,
set `ELLM_SHA_WEB_IMAGE`, `MEMORY_CORE_IMAGE`, `MEMORY_HUB_IMAGE`, and optionally
`PROXY_IMAGE` to the `image@sha256:...` references in `images.json`.

```sh
docker compose --env-file .env -f docker/compose.release.yaml config --quiet
docker compose --env-file .env -f docker/compose.release.yaml pull
# Stop the old deployment's writers before switching its existing volumes.
# For the source compose deployment:
docker compose --env-file .env -f compose.yaml -f docker/compose.vps.yaml down
docker compose --env-file .env -f docker/compose.release.yaml up -d --wait
```

Add `--profile proxy` to both pull and up if using the separately configured
proxy. Before its first start, create the external `PROXY_VOLUME` (default
`ellmsha-v3-memory-proxy`) and retain it with the other backups. If an older proxy
kept SQLite only in its container layer, copy that database with the writer stopped
before replacing the container; adding a volume does not migrate old data.
Never run `down -v` during an update. Image rollback changes image
references, not database contents; restore a stopped-writer backup if a later
release changed an incompatible schema. All published host ports remain bound
to loopback; use the existing SSH tunnel or an authenticated TLS reverse proxy.

The prebuilt web UI uses the default Memory panel URL `http://127.0.0.1:8125/`.
Keep that browser-facing tunnel/port mapping; a custom embedded panel URL still
requires the existing source build's `TDAI_PANEL_URL` build argument.

The pull-only compose deliberately rejects missing private bind files. Images
contain no accounts, API keys, chat databases or local workspaces.

## First installation: bootstrap once, then use pull-only compose

The existing [VPS bootstrap](../docs/vps-deployment.md) remains the source of
configuration and account provisioning. On a **fresh, dedicated host**, use the
same release checkout and `.env.example`, with these changes:

1. Set `MEMORY_CORE_IMAGE`, `MEMORY_HUB_IMAGE` and optional `PROXY_IMAGE` to the
   published version or digests. Keep `TDAI_BIND_HOST=127.0.0.1` and the persistent
   volume names. Configure the embedding service and private provider settings
   as described by the VPS guide.
2. Run only the existing image bootstrap scripts below. They pull the published
   images, generate private config, and provision the existing identity schema.
   They do **not** compile source. These scripts use fixed bootstrap container
   names, so do not use them against a different existing stack.

```sh
scripts/v3.sh init
# Edit .env first; never put credential values in shell history.
export ENV_FILE="$PWD/.env"
export MEMORY_CORE_ADMIN_KEY_FILE="$PWD/.data/tencentdb/admin-key"
export MEMORY_CORE_CONFIG_DIR="$PWD/.data/tencentdb/core-config"
export PROXY_CONFIG_DIR="$PWD/.data/tencentdb/proxy-config"
tencentdb-agent-memory/deploy/global-images/start-memory-core.sh
tencentdb-agent-memory/deploy/global-images/start-memory-hub.sh
python3 scripts/bootstrap-memory.py
# Optional: PROXY_FULL_STACK=1 tencentdb-agent-memory/deploy/global-images/start-proxy.sh
mkdir -p .data/aionui workspaces
# Stop/remove only the just-created bootstrap containers; preserve their volumes.
docker stop tdai-memory-hub tdai-memory-core
docker rm tdai-memory-hub tdai-memory-core
# Also stop/remove tdai-memory-proxy if you started that optional bootstrap.
# Optional proxy persistence (fresh empty installation only):
# docker volume create ellmsha-v3-memory-proxy
docker compose --env-file .env -f docker/compose.release.yaml up -d --wait
```

Keep `.data/tencentdb` and `.env` together with the matching volume backups.
The bootstrap scripts are required only for the first identity/configuration
setup, not normal updates. Existing `compose.yaml` + `compose.vps.yaml` source
build workflows are unchanged.

## Build and publication checks

`docker-images.yml` takes `version`, exact `source_ref`, and `publish` (false by
default); it returns artifact name `ellmsha-images-<version>`. Builds use a clean
recursive checkout, a tracked-only archive with private paths removed, locked
npm/Cargo/Bun inputs, and the same memory runtime locks as the desktop bundle.
The OCU runtime validates the maintained fork's source digest and records its
fork commit, upstream commit and source digest.

Before any push, CI starts uniquely named, resource-limited temporary containers
on an internal network. It checks web static serving plus an actual backend JSON
response, MemoryCore health, both hub services and panel static serving, and
proxy health. It uses synthetic empty storage and no provider calls. This is an
image/startup check, not proof of production credentials, live LLM quality,
database migration, desktop automation, or a fresh VPS installation. Linux
Computer Use also needs a separately configured graphical accessibility session;
a headless VPS does not acquire desktop-control capabilities from the image.

For the first GHCR publication, a maintainer must ensure each package is public
in GitHub package settings. Repository visibility alone is not proof of package
visibility. Verify an anonymous pull from a clean Docker client before announcing
public availability; do not embed a personal token in deployment files.

```sh
node --test docker/release-images.test.mjs
# Post-release promotion only (requires GHCR login and GitHub release read access):
node docker/promote-images.mjs --manifest images.json --release-url "https://github.com/ShiftHackZ/ellmsha/releases/tag/v<VERSION>"
```
