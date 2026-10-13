# Native desktop builds

## Prepare the checkout

Use the maintained fork revisions recorded by this checkout. Release commits pin published component revisions; do not replace them with upstream to get a clean clone building. See [release status](../../docs/release-status.md).

Install the native toolchains described below. CI pins Node.js 24.11.0, Bun 1.3.9, Python 3.12.10, Go 1.22.12 and Rust 1.95.0. The macOS arm64 job selects Xcode 26.2 (Swift 6.2) on `macos-15`; Windows x64 uses `windows-2022`. These are configured inputs, not a claim that the hosted jobs have passed.

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

The build script never publishes. On macOS, an external host signing configuration opts this machine into signed builds by default; without it, the build is unsigned. It compiles the local Rust backend with the locked dependency graph, then invokes the existing desktop packager, including its bundled-resource checks. Artifacts go to `aionui/out`. The `Release installers and VPS images` workflow described below replaces the former desktop-packages workflow. Linux desktop packages remain available through the local build script; CI targets Linux VPS images instead.

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

The external `identity` must be the full certificate common name beginning with `Apple Development:` or `Developer ID Application:`. Surrounding whitespace is trimmed; hashes and partial-name selectors are rejected before building. Only the electron-builder selector omits its forbidden `Developer ID Application:` prefix. Native signing resolves the full certificate name, and app/helper verification requires that exact authority and team. Prepackaged macOS recovery validates the signature first and, for notarized builds, the stapled ticket and Gatekeeper acceptance before repacking; an existing `.app` alone is not evidence of successful signing.

An Xcode-managed Apple Development identity supports local installations. It is **not** a notarized public distribution identity. Public distribution requires a Developer ID Application identity (`type: "distribution"`) and, for notarization, an optional `notaryProfile` naming credentials already held in Keychain. Do not put account credentials, certificates, private keys, provisioning profiles or machine-specific configuration in this repository.

Keep bundle identifiers and the certificate-based designated requirements stable between updates. Moving from a previous ad-hoc build to certificate signing is an identity transition: macOS may require permission once again. Signing does not grant permissions or guarantee that an expired/changed certificate will retain consent. Verify the actual main app and helper after packaging; never reset TCC as a build step.

Signing and actual Windows/Linux installation must be verified on their respective hosts before describing artifacts as release-tested.

## GitHub Actions release pipeline

Open **Actions → Release installers and VPS images → Run workflow** with `publish=false` (the default) to verify installers without publishing a release or pushing GHCR images. Every run produces **Developer ID signed and notarized macOS arm64 DMG/ZIP** and **unsigned Windows x64 NSIS EXE**. macOS verification uses the same temporary keychain, signed build, stapled-ticket validation and Gatekeeper assessment as publication. The pipeline also produces per-platform `SHA256SUMS-*.txt`, build provenance including the signing policy and actual result, and a Linux/amd64 image manifest. The image job runs disposable service smoke tests. Workflow artifacts are retained for 14 days. A successful build does not establish native installation or account-login acceptance.

| Run | `publish` | Result |
| --- | --- | --- |
| Default manual verification | `false` | Signed/notarized macOS and unsigned Windows artifacts; no GitHub/GHCR publication |
| Exact-tag publication | `true` | Same signing policy, plus gated GitHub/GHCR publication |

Every preflight and macOS job uses the **release** environment; the Windows job uses **ci**. All six Apple secrets below are required even for `publish=false`; missing readiness fails preflight before desktop compilation. There is no unsigned macOS workflow mode or Windows signing option. Job names state each platform's signing policy and whether the run is verification or publication. Configuration support is not evidence of a completed signed CI run; inspect that run's signing, notarization and verification results.

The workflow has no pull-request trigger. Public publication requires the official `ShiftHackZ/ellmsha` repository, an exact `vYYYY.MM.DD-patch.N` tag, matching package/About metadata and release notes at `docs/releases/YYYY.MM.DD-patch.N.md`. The version's date must equal the publication day in **Europe/Kyiv**. Manual verification runs accept a candidate's earlier date; bump the metadata before tagging if publication moves to another day. Both preflight and the final publication job check the date, root SHA and every recursive gitlink. Changed fork revisions must already be available from their public remotes.

Configure a GitHub **release** environment (with any desired human protection rules) and these secrets before signed verification or publication:

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64` | Base64 of a Developer ID Application certificate exported with its private key |
| `MAC_CERTIFICATE_PASSWORD` | Password protecting that P12 export |
| `MAC_SIGNING_IDENTITY` | Exact `Developer ID Application: …` identity |
| `MAC_TEAM_ID` | Ten-character Apple team ID |
| `MAC_NOTARY_APPLE_ID` | Apple account used by notarization |
| `MAC_NOTARY_APP_PASSWORD` | Its app-specific password |

Apple Development certificates are sufficient for local development signing, but CI rejects them. The job imports the P12 into a temporary runner keychain and stores notarization credentials there. Only a public signing selector is exported to the build; certificate bytes are removed after import. An `always()` cleanup restores the original keychain search list and removes temporary signing files, including after failed verification. These files are outside the checkout, caches and uploaded artifact paths. The build verifies the main app/helper signatures; CI additionally validates the stapled ticket and Gatekeeper assessment before accepting macOS artifacts.

Windows builds always use `--unsigned` and their metadata records that disposition. No Windows certificate is required or consumed by this workflow.

Desktop jobs must both succeed before candidate images are pushed to GHCR. The reusable [Docker workflow](../../.github/workflows/docker-images.yml) publishes immutable version/source tags and an `images.json` digest manifest; it never promotes `latest`. The final job verifies installer hashes and all image identities against the same root SHA, stages a GitHub draft, then publishes it. An interrupted draft can be resumed only for the same tag and exact source; an already published release is never overwritten. Publication and image promotion are serialized across tags, and a release older than the current stable `latest` is rejected. Only after publication are the manifest's exact image digests promoted to `latest`. A failed later stage can leave candidate image tags or an unpublished draft for inspection; neither is silently deleted.

Caches contain dependency downloads and Rust output only. A non-cancelled packaging failure still saves these paths, so a later retry can reuse successful Rust compilation; signing material and installers are excluded. Desktop Node packaging has a 4096 MiB old-space limit, inherited by the Chrome MCP Rollup subprocess; the 7 GB macOS arm64 runner runs Rust and Node packaging sequentially. Builds use native hosts and locked dependencies, and action versions are pinned to verified upstream commit SHAs. Public assets are an explicit allowlist of full installers, checksums and provenance. In-app updates download/open the full installer; this workflow does not produce Squirrel packages, delta packages or update YAML.

Validation commands (no build or publication):

```sh
node --test scripts/release/*.test.mjs scripts/run-build-command.test.js docker/release-images.test.mjs
actionlint .github/workflows/release.yml .github/workflows/docker-images.yml
```

References: [GitHub macOS certificate handling](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications), [runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [macOS arm64 image toolchains](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md), and [GHCR authentication/visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). New GHCR packages may initially be private; confirm each package's public visibility before advertising anonymous VPS pulls.

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
