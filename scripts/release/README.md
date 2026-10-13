# Native desktop builds

## Prepare the checkout

Use the maintained fork revisions recorded by this checkout. Release commits pin published component revisions; do not replace them with upstream to get a clean clone building. See [release status](../../docs/release-status.md).

Install the native toolchains described below. The current CI configuration pins Node.js 22.20.0, Bun 1.3.9, Python 3.12 and Go 1.22.12; AionCore selects Rust 1.95.0 through its `rust-toolchain.toml`. These are the configured build inputs, not a claim that every platform CI job has passed.

From the repository root, install the locked frontend dependencies:

```sh
cd aionui
bun install --frozen-lockfile
cd ..
```

The build prepares the memory, Mobile MCP, Chrome DevTools and Computer Use runtimes from the maintained local sources. Allow network access for locked dependency/runtime downloads and sufficient disk space; do not edit lockfiles to bypass an installation failure.

## Build and verify

Run from the repository root:

```sh
node scripts/release/build.mjs --plan
node scripts/release/build.mjs
node scripts/release/verify-artifacts.mjs
```

The build never publishes. On macOS, an external host signing configuration opts this machine into signed builds by default; without it, the build is unsigned. It compiles the local Rust backend with the locked dependency graph, then invokes the existing desktop packager, including its bundled-resource checks. Artifacts go to `aionui/out`. The manual `Desktop packages` workflow builds macOS arm64, Windows x64 and Linux x64 packages and uploads workflow artifacts; it never creates a GitHub release. Artifact visibility follows repository permissions.

| Build host | Artifacts |
| --- | --- |
| macOS arm64 / x64 | DMG and ZIP |
| Windows arm64 / x64 | NSIS EXE installer |
| Linux arm64 / x64 | Flatpak bundle and DEB |

Use a native host for each OS and architecture. Cross-compilation is deliberately rejected by the desktop runtime preparer. Install Rust (the repository toolchain), Node.js/npm, Bun, Python and the platform C/C++ toolchain first. Computer Use additionally needs Swift on macOS or Go on Windows/Linux. Linux Flatpak builds require `flatpak`, `flatpak-builder`, the Freedesktop SDK/Platform 26.08 and Electron2 BaseApp 26.08.

### macOS signing on the build host

Keep the private key in the login Keychain managed by Xcode. Configure only its public selector in `~/.config/ellmsha/mac-signing.json` (mode 600), or select another file outside the checkout with `ELLM_SHA_MAC_SIGNING_CONFIG`:

```json
{
  "identity": "Apple Development: Your Name (CERTIFICATE_ID)",
  "teamIdentifier": "YOURTEAMID",
  "type": "development"
}
```

`node scripts/release/build.mjs` then signs by default on that host. `--signed` requires the external configuration; `--unsigned` is an explicit unsigned build. The signed build fails if signing fails or if the main app or Computer Use helper has an ad-hoc signature, unexpected team, or hash-only designated requirement. It never repairs a failed certificate signature by silently using ad-hoc signing.

An Xcode-managed Apple Development identity supports local installations. It is **not** a notarized public distribution identity. Public distribution requires a Developer ID Application identity (`type: "distribution"`) and, for notarization, an optional `notaryProfile` naming credentials already held in Keychain. Do not put account credentials, certificates, private keys, provisioning profiles or machine-specific configuration in this repository.

Keep bundle identifiers and the certificate-based designated requirements stable between updates. Moving from a previous ad-hoc build to certificate signing is an identity transition: macOS may require permission once again. Signing does not grant permissions or guarantee that an expired/changed certificate will retain consent. Verify the actual main app and helper after packaging; never reset TCC as a build step.

Signing and actual Windows/Linux installation must be verified on their respective hosts before describing artifacts as release-tested.

The artifact verifier requires **every** expected format for the current version and host architecture, then writes a SHA-256 manifest beside the packages. This catches a missing Flatpak even if the DEB build succeeds. Checksums verify downloaded bytes; they do not replace signing or installation tests. CI also probes the real npm launcher on each host before building, including Windows' `npm.cmd` entry point through Node.

Linux builds first check the configured Flatpak runtime, SDK and base, then launch the SDK sandbox before compiling. Missing tools/runtimes or denied namespaces fail with the original diagnostic.

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
- User decision (2026-10-10): Windows/Linux acceptance requires package creation only; both builds may be skipped for the current milestone because no test VMs are available. Installation/runtime, cross-version migration and external host-agent checks on those systems are deferred, not claimed as passed.
- Tencent preparation uses checked-in npm locks in `aionui/scripts/memory/locks`, installed with the shipped Node ABI. Update those locks deliberately when dependency declarations change; a mismatched manifest fails `npm ci`.

See the final project documentation for user workflows and VPS deployment; this file describes build operations only.
