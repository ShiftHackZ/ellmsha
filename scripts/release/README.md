# Native desktop builds

For development builds, use [GitHub Actions](../../CI.md). The local commands below support packaging diagnostics.

## Prepare the checkout

Use the maintained fork revisions recorded by this checkout. Release commits pin published component revisions; do not replace them with upstream to get a clean clone building. See [release status](../../docs/release-status.md).

Install the native toolchains described below. CI pins Node.js 24.11.0, Bun 1.3.9, Python 3.12.10, Go 1.22.12 and Rust 1.95.0. The macOS arm64 job selects Xcode 26.2 (Swift 6.2) on `macos-15`; Windows x64 uses `windows-2022`; Linux x64 uses `ubuntu-24.04`. These are configured inputs, not a claim that the hosted jobs have passed.

From the repository root, install the locked frontend dependencies:

```sh
cd aionui
bun install --frozen-lockfile
cd ..
```

The build prepares the memory, Mobile MCP, Chrome DevTools and Computer Use runtimes from the maintained local sources. Allow network access for locked dependency/runtime downloads and sufficient disk space; do not edit lockfiles to bypass an installation failure.

## Build and verify

For a macOS Apple Silicon release candidate, configure the host identity below, then run from the repository root using the pinned toolchains:

```sh
node scripts/release/build.mjs --plan --signed
node scripts/release/build.mjs --signed
xcrun stapler validate aionui/out/mac-arm64/eLLMsha.app
spctl --assess --type execute --verbose=2 aionui/out/mac-arm64/eLLMsha.app
node scripts/release/verify-artifacts.mjs
```

The build script never publishes. Use the same signed build, stapled-ticket validation and Gatekeeper commands as CI for macOS release acceptance; stop if any step fails. `verify-artifacts.mjs` checks installer presence and hashes, so it does not replace the signature, notarization or native runtime checks. On macOS, an external host signing configuration opts this machine into signed builds by default; without it, the build is unsigned. `--signed` requires that configuration. The script compiles the local Rust backend with the locked dependency graph, then invokes the existing desktop packager, including its bundled-resource checks. Artifacts go to `aionui/out`. Windows and Linux release builds use `--unsigned`. CI builds Linux desktop Flatpak, DEB and AppImage packages independently from Linux VPS images.

| Build host | Artifacts |
| --- | --- |
| macOS arm64 / x64 | DMG and ZIP |
| Windows arm64 / x64 | NSIS EXE installer |
| Linux arm64 / x64 | Flatpak, DEB and container-built AppImage |

Use a native host for each OS and architecture. Cross-compilation is deliberately rejected by the desktop runtime preparer. Install Rust (the repository toolchain), Node.js/npm, Bun, Python and the platform C/C++ toolchain first. Computer Use additionally needs Swift on macOS or Go on Windows/Linux. Linux Flatpak builds require `flatpak`, `flatpak-builder`, the Freedesktop SDK/Platform 26.08 and Electron2 BaseApp 26.08.

### Linux package selection

On an Ubuntu 24.04 x64 build host, install `build-essential`, `cmake`, `pkg-config` and `libssl-dev`, plus `flatpak`, `flatpak-builder` and `dbus-x11` when building Flatpak. Install the pinned Node/Bun/Python/Go/Rust toolchains and locked frontend dependencies described above. To build only Flatpak from the repository root:

```sh
export RELEASE_LINUX_PACKAGES=flatpak
export FLATPAK_USER_DIR="$PWD/.data/flatpak-user"
node scripts/release/flatpak-preflight.mjs --install
node scripts/release/build.mjs --plan --unsigned
node scripts/release/build.mjs --unsigned
node scripts/release/verify-artifacts.mjs
```

Select `deb`, `flatpak`, `appimage`, or a comma-separated subset such as `deb,appimage`. The default `all` builds all three. AppImage packaging requires Docker on the native Linux host. Keep the same selection for preparation, building, verification and staging. The preparation helper reads the actual Electron Builder configuration, adds the official Flathub remote to the isolated user installation, installs or updates its configured runtime/SDK/base, and exercises the SDK sandbox. It skips Flatpak commands for DEB-only builds. On a headless host without a session bus, run preparation/build commands through `dbus-run-session -- node ...`; CI does this automatically for Flatpak preparation and packaging. The helper does not modify the application's profile or install eLLMsha itself.

`FLATPAK_USER_DIR` is Flatpak's supported override for the per-user installation; CI uses it to cache runtimes outside the checkout. See the [Flatpak command reference](https://docs.flatpak.org/en/latest/flatpak-command-reference.html) and [Electron Builder's v26 Flatpak guide](https://www.electron.build/v26/docs/flatpak/). Packaging produces a single-file bundle, not a Flathub repository submission.

### macOS signing on the build host

Use the same Developer ID Application certificate and private key as GitHub Actions, held in the local Keychain. After importing the protected P12 through a secure local workflow, compare its public leaf-certificate fingerprint with an accepted CI app. Configure only public selectors in `~/.config/ellmsha/mac-signing.json` (mode 600), or select another file outside the checkout with `ELLM_SHA_MAC_SIGNING_CONFIG`:

```json
{
  "identity": "Developer ID Application: Dmytro Moroz (383EQFRA4A)",
  "teamIdentifier": "383EQFRA4A",
  "type": "distribution",
  "notaryProfile": "ellmsha-local"
}
```

Create `ellmsha-local` credentials with `xcrun notarytool store-credentials ellmsha-local --apple-id "YOUR_APPLE_ID" --team-id 383EQFRA4A` in a secure local terminal, supplying the Apple account, team `383EQFRA4A` and app-specific password at its prompts. Do not put the password in chat, shell arguments/history, source files or logs. The local profile name may differ from CI's `ellmsha-ci`; the certificate, team and notarization policy must match. Missing credentials must be resolved before a release build, without falling back to an unsigned or non-notarized package. On 2026-10-14, this host completed a full signed and notarized local build using this profile; independent app/helper policy comparison and both DMG/ZIP distribution checks passed. See [the local acceptance record](../../docs/releases/2026.10.14-patch.11.md#local-signing-acceptance). New hosts still need their own credential setup and verification.

`node scripts/release/build.mjs` then signs by default on that host. The explicit `--signed` release command requires the external configuration; `--unsigned` is an explicit unsigned build. The signed build fails if signing fails or if the main app or Computer Use helper has an ad-hoc signature, unexpected team, or hash-only designated requirement. It never repairs a failed certificate signature by silently using ad-hoc signing.

The external `identity` must be the full certificate common name beginning with `Apple Development:` or `Developer ID Application:`. Surrounding whitespace is trimmed; hashes and partial-name selectors are rejected before building. Only the electron-builder selector omits its forbidden `Developer ID Application:` prefix. Native signing resolves the full certificate name, and app/helper verification requires that exact authority and team. Prepackaged macOS recovery validates the signature first and, for notarized builds, the stapled ticket and Gatekeeper acceptance before repacking; an existing `.app` alone is not evidence of successful signing.

The parser still supports Apple Development for development-only installations, but release candidates require Developer ID Application, `type: "distribution"` and a working `notaryProfile`. A signed development build does not satisfy this release policy. Do not put account credentials, certificates, private keys, provisioning profiles or machine-specific configuration in this repository.

Local and CI builds share `build.mjs`, Electron Builder configuration, app/helper bundle identifiers, `entitlements.plist` and hardened runtime settings. Verify the exact certificate/team and designated requirements, emitted entitlements and hardened-runtime flags, stapled ticket and Gatekeeper result when comparing candidates. The existing signing hook checks the selected certificate/team and rejects hash-only designated requirements; it does not itself compare the full requirement or emitted entitlements with another build. Signing parity requires matching emitted signing properties. Record exact source revisions separately; any source difference, including a documentation-only root change with unchanged component revisions, must be explicit. Secure signing timestamps, notarization tickets and packaging can produce different bytes and hashes; byte-for-byte equality between local and CI builds is not promised.

Keep bundle identifiers and the certificate-based designated requirements stable between updates. Moving from a previous ad-hoc build to certificate signing is an identity transition: macOS may require permission once again. Signing does not grant permissions or guarantee that an expired/changed certificate will retain consent. Verify the actual main app and helper after packaging; never reset TCC as a build step.

Signing and actual Windows/Linux installation must be verified on their respective hosts before describing artifacts as release-tested.

### Native checks before publication

Before creating a release tag, test the exact source candidate natively using a local build under the release signing policy or downloaded artifacts from a `publish=false` workflow run. Record the root/component revisions, artifact hashes, tested OS, actual feature checks and unresolved failures. Use an isolated profile for candidate feature checks; package creation and component mocks alone do not establish native acceptance. Do not describe skipped or provider-blocked scenarios as passed. Resolve required native checks before tagging, and preserve explicit limits for platforms or features that were not exercised.

The final release workflow rebuilds the installers; it does not promote the exact installer bytes from the earlier verification run. Recheck the published hashes, provenance, signatures and notarization, and repeat any runtime check affected by a source or packaging change. Do not claim that prepublication QA exercised the eventual published bytes.

## GitHub Actions release pipeline

See [CI.md](../../CI.md) for manual branch selection, platform switches, PR tests, artifact downloads and release-tag behavior. Every macOS job, including develop and feature branches, uses the same signing, notarization and validation as main and requires the six release-environment secrets listed below. There is no unsigned CI fallback.

The workflow has no pull-request trigger. Public publication requires the official `ShiftHackZ/ellmsha` repository, an exact `vYYYY.MM.DD-patch.N` tag, matching package/About metadata and release notes at `docs/releases/YYYY.MM.DD-patch.N.md`. The version's date must equal the publication day in **Europe/Kyiv**. Manual verification runs accept a candidate's earlier date; bump the metadata before tagging if publication moves to another day. Both preflight and the final publication job check the date, root SHA and every recursive gitlink. Changed fork revisions must already be available from their public remotes.

Configure a GitHub **release** environment (with any desired human protection rules) and these secrets before macOS verification or full publication:

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64` | Base64 of a Developer ID Application certificate exported with its private key |
| `MAC_CERTIFICATE_PASSWORD` | Password protecting that P12 export |
| `MAC_SIGNING_IDENTITY` | Exact `Developer ID Application: …` identity |
| `MAC_TEAM_ID` | Ten-character Apple team ID |
| `MAC_NOTARY_APPLE_ID` | Apple account used by notarization |
| `MAC_NOTARY_APP_PASSWORD` | Its app-specific password |

Apple Development certificates are sufficient for local development signing, but CI rejects them. The job imports the P12 into a temporary runner keychain and stores notarization credentials there. Only a public signing selector is exported to the build; certificate bytes are removed after import. An `always()` cleanup restores the original keychain search list and removes temporary signing files, including after failed verification. These files are outside the checkout, caches and uploaded artifact paths. The build verifies the main app/helper signatures; CI additionally validates the stapled ticket and Gatekeeper assessment before accepting macOS artifacts.

Windows and Linux builds always use `--unsigned` and their metadata records that disposition. No Windows certificate or Flatpak signing key is required or consumed by this workflow. Flatpak output is a downloadable single-file bundle, not publication to Flathub.

Signed macOS packaging preloads the builder's existing `graceful-fs` file-open queue before its signing dependencies load. This prevents `@electron/osx-sign`'s parallel binary scan from exhausting the runner's file descriptors; every signing candidate and every signature/notarization check is retained. The preload applies only to the macOS builder process (including packaging retries), without changing OS limits or application runtime behavior. Its queue retries descriptor exhaustion while file closes make progress; other open errors propagate normally.

The reusable [Docker workflow](../../.github/workflows/docker-images.yml) only builds and smoke-tests images; it never pushes to GHCR. For full publication only, it exports the tested image IDs as a Docker tar artifact from the same workflow run, with the image manifest. Verification runs do not transfer this tar artifact. The final publication job waits for all three desktop platforms and the Docker branch to succeed, loads the image archive, and validates installer checksums plus exact tested image IDs, Linux/amd64 platform and expected OCI labels against the release version and root SHA. It then pushes immutable version/source image candidates, records their registry digests, and publishes the GitHub release. An interrupted draft can be resumed only for the same tag and exact source; an already published release is never overwritten. Publication and image promotion are serialized across tags, and a release older than the current stable `latest` is rejected. Only after publication are the manifest's exact image digests promoted to `latest`. A failed later stage can leave candidate image tags or an unpublished draft for inspection; neither is silently deleted.

Caches contain dependency downloads and Rust output. Flatpak builds additionally cache their isolated per-user Flatpak installation under the runner's temporary directory, keyed by target and the configured runtime inputs; restored runtimes are updated before packaging. This cache is separate from compiler/dependency caches and contains no application profile. Runs without Flatpak skip Flatpak preparation and its cache. A non-cancelled packaging failure still saves eligible cache paths, so a later retry can reuse successful compilation and downloads; signing material, app bundles and installers are excluded. Desktop Node packaging has a 4096 MiB old-space limit, inherited by the Chrome MCP Rollup subprocess; Rust and Node packaging run sequentially per runner. Builds use native hosts and locked dependencies, and action versions are pinned to verified upstream commit SHAs. Public assets are an explicit allowlist of full installers, checksums and provenance. In-app updates download/open the full installer; this workflow does not produce Squirrel packages, delta packages or update YAML.

Validation commands (no build or publication):

```sh
node --test scripts/release/*.test.mjs scripts/run-build-command.test.js docker/release-images.test.mjs
actionlint .github/workflows/release.yml .github/workflows/docker-images.yml
```

References: [GitHub macOS certificate handling](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications), [runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [macOS arm64 image toolchains](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md), and [GHCR authentication/visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). New GHCR packages may initially be private; confirm each package's public visibility before advertising anonymous VPS pulls.

The artifact verifier requires **every selected** format for the current version and host architecture, then writes a SHA-256 manifest beside the packages. Linux verification may explicitly select any subset of Flatpak, DEB and AppImage; full publication requires all three, catching a missing Flatpak even if DEB succeeded. Staging accepts only the selected allowlisted files and records their source/hash/size metadata. Checksums verify downloaded bytes; they do not replace signing or installation tests. CI also probes the real npm launcher on each host before building, including Windows' `npm.cmd` entry point through Node.

Linux builds that include Flatpak check the configured runtime, SDK and base, then launch the SDK sandbox before compiling. Missing tools/runtimes or denied namespaces fail with the original diagnostic; the pipeline does not disable the host's sandbox protections. DEB-only builds do not require Flatpak. The Linux desktop branch still requires hosted package-creation acceptance; desktop runtime checks below remain separate.

### Deferred Linux runtime checks

Install a candidate on a Linux desktop with `flatpak install --user ./eLLMsha-<version>-linux-x64.flatpak`, then run `flatpak run com.ellmsha.app`. Check chat creation, native memory startup, restart persistence and file access to a disposable workspace. Repeat installation with an earlier release's retained data for migration acceptance. Uninstall with `flatpak uninstall --user com.ellmsha.app` **without** `--delete-data`, reinstall and verify the retained chat and memory.

Flatpak's private app-data directory differs from a native DEB profile; they are not automatically the same installation. Host filesystem access also does not imply permission to execute host-installed Codex/Claude CLIs. The current package has no host-process bridge. Bundled Codex/Claude executables are resolved separately by the runtime. External host CLI support remains unimplemented and must not be advertised as verified. Do not bypass that gate by broadly granting session-bus access.

## Preserve chats and memory

Application data stays in the platform user-data directory, outside the installation. Development and packaged builds both use `eLLMsha Desktop` under Electron's platform app-data directory unless `ELLM_SHA_USER_DATA_DIR` explicitly overrides it. On macOS this is `~/Library/Application Support/eLLMsha Desktop`. An empty isolated QA profile does not indicate that installation deleted the normal profile. Never run development and release builds against the same profile concurrently during installer tests.

NSIS preserves app data on uninstall; Flatpak stores its private data under the Flatpak application directory. Do not use Flatpak's `--delete-data` option when preserving chats and memory.

## Verified macOS package checks

On 2026-10-10, the arm64 `2026.10.9-patch.1` DMG passed checksum verification. The app copied from that DMG passed `codesign --verify --deep --strict`, launched its bundled Rust backend and all three native Tencent services without Docker, and used a dedicated disposable profile.

Replacing that installed app from the same DMG and restarting with the same profile preserved a synthetic conversation's ID/name and the exact Tencent note content and identity. A second reinstall preserved the complete history API response for a two-message conversation generated through a deterministic local provider: user and assistant text, IDs, timestamps, positions, statuses and pagination cursors matched exactly. A further installed test retained the exact three-record history response containing an uploaded attachment reference, completed `Read` input/output and assistant reply; the uploaded file SHA-256 also matched and the history rendered correctly after replacement. This verifies **same-version reinstall persistence**, including that bounded attachment/tool-history case. A subsequent rebuilt DMG passed the legacy-upload migration check: before the chat was opened, startup copied its existing attachment into profile-owned storage and rewrote only that message path. With the original temporary path reversibly removed, the authenticated upload API returned identical bytes and the native UI retained the attachment and Read history. A second restart preserved the migrated history exactly and the file remained readable. The original synthetic source was restored after QA. Migrations between different application/database versions still require their own checks. The signature is ad-hoc, not a Developer ID signature or notarization.

For each subsequent installer candidate, use an isolated profile, create a chat with messages and a memory note, quit the app, replace only the application, and relaunch with the same profile. Compare the original chat/messages and memory through the running app. An upgrade test must start with an actual earlier release; reinstalling one build is not an upgrade test.

## Current release gates

- Publish each changed maintained fork revision before publishing the root commit that pins it. Verify that every release gitlink is reachable from its public fork.
- Windows/Linux publication requires package creation; the earlier 2026-10-10 milestone's permission to skip their builds does not bypass the current all-platform publication gate. Installation/runtime, cross-version migration and external host-agent checks on those systems remain deferred and are not claimed as passed.
- Tencent preparation uses checked-in npm locks in `aionui/scripts/memory/locks`, installed with the shipped Node ABI. Update those locks deliberately when dependency declarations change; a mismatched manifest fails `npm ci`.

See the final project documentation for user workflows and VPS deployment; this file describes build operations only.
