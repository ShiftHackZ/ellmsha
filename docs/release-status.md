# Release readiness — 2026-10-10

This is an evidence ledger. Release notes: [v2026.10.10 Patch 3](releases/2026.10.10-patch.3.md).

The refreshed macOS candidate includes the Clockify report repairs and Computer Use permission setup and button corrections, alongside the earlier WebUI and durable-upload repairs. Its DMG and ZIP build completed on 2026-10-10; package checksums and the copied installer app’s ad-hoc signature were verified. With the debug app stopped, the app copied from that DMG launched on the normal eLLMsha Desktop profile: existing projects/chats appeared, the latest chat message ID matched, and an existing durable memory note was read successfully. Earlier isolated installed migration, restart and theme checks remain bounded evidence as recorded below.

| Area | Evidence | Remaining boundary |
| --- | --- | --- |
| macOS arm64 DMG/ZIP | Native build, checksum, bundled-resource checks and ad-hoc signature verified | Developer ID signing and notarization |
| Installed runtime | Bundled backend and three native memory services launched | Other operating systems |
| Data persistence | Same-version DMG replacement retained text history and memory; a separate installed test retained the exact three-record API response (user attachment, completed Read input/output, assistant reply) and attachment SHA-256, also verified in native UI. Rebuilt DMG migrated an unopened legacy attachment at startup; exact bytes remained readable without the temp source and after restart | Cross-version migrations; broader attachment formats and consumers beyond the verified text fixture |
| Embedding lifecycle | Isolated 2D→4D switch preserved L1/L0 sources and search across restart; partial 6D rebuild failure restored exact vectors and both searches; installed native Memory UI completed real bge-m3 1024→nomic-embed-text 768→bge-m3 1024 on an isolated L1 fixture, preserving exact source content and restoring configuration; shutdown waits for process exit; a separate isolated real-model 1024→768 controller test retained exact source hashes for three L1 and two L0 records, rebuilt both vector schemas/counts and returned the expected top semantic result for each layer | Larger-corpus performance/ranking acceptance; real-provider failure rollback (deterministic rollback tested separately) |
| Windows preparation | npm launcher repair, focused tests, native CI probe configured | Build skipped for this milestone by user authorization; native install/upgrade QA deferred |
| Linux preparation | DEB/Flatpak targets and prerequisites configured | Builds skipped for this milestone by user authorization; native desktop QA deferred |
| Flatpak | Packaging configuration and acceptance procedure documented | External host CLI bridge is unimplemented; Linux runtime verification deferred by user |
| Plugins | Pinned GitHub subdirectory install, source metadata, live skill discovery and removal verified | Compatibility depends on package capabilities |
| Linear | User connected two accounts; browser launch/loading accepted; both account namespaces passed identity/workspace and bounded issue/comment/attachment-metadata reads; an unscoped request required account selection | Mutation isolation, broader attachment formats, full tool matrix and token renewal |
| Clockify | One user-connected account passed identity/workspace/project reads. Repaired report date formatting and empty-terminal-page handling; rebuilt live bounded report returned complete zero, one covered interval, no missing intervals or truncation. Focused tests and independent review passed | Populated report parsing, individual entry read-back and live multi-account isolation remain unverified; a second account is not required for this milestone |
| Computer Use | Both macOS permissions confirmed for the bundled runtime. Installed plugin discovered Calculator, captured its accessibility tree/screenshot, clicked observed controls and read back 73; evaluator independently confirmed the native result. Plugin permission check showed both Granted; shared rounded action visually checked in Light and Dark | Broader application coverage and missing-permission onboarding on a fresh host; slow/error visual states covered by focused tests rather than forced native failures |
| Diagnostic themes | Technical Details contrast visually checked in Light, Dark and eLLMsha; rebuilt WebUI applies Dark, eLLMsha, Follow System and Light with success feedback and retains each selection through actual browser reload; 16 lifecycle/ordering tests and bounded review passed | Fresh DMG native Appearance switched Dark/eLLMsha/Follow System/Light with success feedback and renderer reload checks; actual host OS appearance changes and full-process theme restart were not exercised |
| Source distribution | Published root and all nine maintained fork revisions on 2026-10-10; anonymous recursive clone obtained every exact gitlink and passed all three source provenance verifiers | Full builds on a fresh host and cross-platform packaging remain separate from the verified source checkout |
| VPS containers | Current WebUI/core/hub images built on Linux arm64 Docker; four-service isolated stack started; unauthenticated requests rejected; real form login, Plugins load, toggle persistence and logout passed; machine-wide plugin mutations rejected; authenticated WebSocket event delivery and CUA-visible missed-message/runtime recovery without reload passed for a deterministic pre-provider error; a stopped-writer backup restored into new volumes with exact memory and WebUI identity read-back; actual bootstrap script created stable identities and generated working packaged MCP configuration in fresh isolated containers, surviving recreation | Unmodified launcher on a clean VPS, live model streaming/embedding requests and cross-version restore |

## Checks that need the maintainer

The earlier implementation audit was followed by live Clockify report defects and a Computer Use button consistency defect. Those bounded scenarios are now repaired and verified as described above. Remaining decisions and explicitly deferred checks are:

| Dependency | What is needed | Verification after it is available |
| --- | --- | --- |
| Claude | User has no subscription; live QA is skipped for this milestone | Fresh/resumed/child inference remains unverified; no login action is required now |
| Native interactions | Notification click/dismiss observation; pet window targeting or human observation | Check notification navigation/closure and pet animation, drag and menu; the visible notification banner was already confirmed by the user |
| Source publication | Completed on 2026-10-10; root main and all nine maintained integration branches, including AionRS, are public | Anonymous recursive checkout and Mobile/Chrome/Computer Use provenance checks passed; full clean-host builds remain separate checks |

Credentials and OS consent cannot be inferred from successful unit tests. Broader destructive device operations, external issue/time-entry writes and large-corpus performance tests were not part of the bounded acceptance and are not silently added as release requirements.

## Before publication

- Complete applicable macOS and integration gates above. Per user decision on 2026-10-10, Windows/Linux need only package-build verification, and even those builds may be skipped for this milestone; VM installation/runtime QA is deferred. Do not report skipped checks as passed.
- Root license selected by the user on 2026-10-10: AGPL-3.0-only with a separate paid commercial option for rights controlled by Moroz Inc. LICENSE contains the official unmodified text; LICENSING.md describes scope and third-party/contributor boundaries. DMG/ZIP refreshed after license selection; root AGPL/commercial guidance and nine component license texts are bundled. Installed from the refreshed DMG to /Applications/eLLMsha.app and launched on the real profile with existing chats and memory verified. Source publication was authorized on 2026-10-10. Binary release publication is separate from the source push; provide corresponding-source access with binary distributions.
- All required fork revisions are reachable. An isolated anonymous recursive checkout passed on 2026-10-10, without local upstream remotes or preinstalled dependencies; this is not a full fresh-host build.
- See the bounded [source and license inventory](component-licenses.md). Review tracked/untracked release inputs for private data and secrets. Never publish `.env`, `.data`, local profiles, credentials or commercial workspace contents.
- Build final artifacts, verify checksums and signatures, then obtain authorization for any new binary release publication. The current source push is explicitly authorized.

Build commands, artifact names and Flatpak test procedure are in the [desktop release guide](../scripts/release/README.md).

## Source publication verification — 2026-10-10

- Root implementation commit: `eccf1ad`; all nine forks published on `feature/ellmsha-v2026.10.9-patch1`, with exact revisions recorded by the root gitlinks.
- Local commit author for publication: Dmitriy Moroz `<dmitriy@moroz.cc>`.
- Fixed preparer assumptions about local upstream remotes, tags, submodule `.git` files and the committed Computer Use fork revision. The installed harness ran 22 focused tests and an independent read-only review with no findings.
- Cloned the public root recursively with credential helpers disabled; all nine pinned revisions checked out and the new worktree was clean. Mobile MCP, Chrome DevTools MCP and Computer Use `--verify-only` checks passed in that clone. No local source alternates or dependency-directory copies were used.
- Source publication does not create a GitHub binary Release or change the existing local macOS installation.

## Patch 3 — 2026-10-10

- Managed Codex CLI 0.162.1 and live catalog discovery verified; actual GPT-6 Astra inference and Tencent memory read passed in the installed app.
- Managed/System/Custom runtime sources and resolved paths/versions checked in native UI. Independent update check returned the same version; no predecessor was available for a live cross-version rollback. Rollback/session pinning have focused test and independent review coverage.
- Fresh/resumed skill and memory discovery passed; harness skills no longer pollute user project repositories. Auto network access and Read Only network access passed; an exclusive write outside the workspace was denied and the probe remained absent.
- Runtime buttons and labels were inspected in Light and Dark. Real profile was preserved across production replacements.
- Release date policy: the date portion of the version matches the publication date in Europe/Kiev. Branding and package metadata are synchronized at 2026.10.10 Patch 3. Historical tags are immutable.
