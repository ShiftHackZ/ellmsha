# Release readiness — 2026-10-13

This is an evidence ledger for [v2026.10.13 Patch 7](releases/2026.10.13-patch.7.md). Publication status and downloadable artifacts are shown on [GitHub Releases](https://github.com/ShiftHackZ/ellmsha/releases/tag/v2026.10.13-patch.7). The preceding release is [v2026.10.11 Patch 5](releases/2026.10.11-patch.5.md). Earlier evidence is retained below.

## Patch 7 — 2026-10-13

[Patch 7 release notes](releases/2026.10.13-patch.7.md) combine the unpublished Patch 6 work with subsequent browser and native-agent repairs. **2026-10-12 candidate: installed and verified; scoped assisted evaluation PASS. 2026-10-13 release-date rebuild: complete; package verification PASS.** The version date follows publication in Europe/Kiev. The installed app was not replaced and no repeated live evaluation of the new dated build is claimed. The earlier `v2026.10.12-patch.7` tag remains an unreleased source snapshot.

- Browser actions verify the exact live target and native input frame, preserve same-URL tab identity, reject closed selections without fallback, and work while another application is active without forcing application focus.
- Dynamic MCP guidance, paginated discovery and safe catalog refresh are included, alongside the source-backed conversation working brief, evidence categories and CodeGraph/source versus memory/history guidance.
- Native empty-response recovery is bounded and retains tool/approval guards; disallowed finalization calls terminate visibly without execution. Additional changes cover automatic titles, Linear embedded-image normalization, empty native field values and explicit native evaluation scope.
- Real-model checks and independent observations passed on disposable, noncommercial fixtures. Browser input/lifecycle and fresh helper-host access passed in the installed candidate; earlier task-context, CodeGraph and title results remain prior Patch 6 evidence. These were assisted scenarios, not proof of autonomous model reliability or universal regression freedom.
- Component regression gates, focused browser/packaging checks, TypeScript, formatting, package verification and independent reviews passed. Final source gates recorded AionCore **8,415 passed / 26 skipped** and AionUI **3,405 passed / 5 skipped**. All earlier failed trials and detailed QA evidence are retained locally; they have not been relabelled as successful tests.
- The `2026.10.13-patch.7` macOS Apple Silicon DMG and ZIP were built. Version metadata, DMG integrity and deep, strict app-signature verification passed; [release notes](releases/2026.10.13-patch.7.md#source-and-binary-correspondence) record their sizes and SHA-256 hashes. The packaged backend and Computer Use helper are byte-identical to the installed evaluated candidate, and the helper's designated requirement is unchanged. Signing remains ad-hoc, without Developer ID signing or notarization. Windows/Linux builds and runtime checks were skipped. Live child/fork isolation, forced-compaction recovery, long-session guidance growth and future changed-helper permission persistence remain unverified.

## Unpublished candidate — 2026-10-12 Patch 6

[Candidate changes and verification](releases/2026.10.12-patch.6.md) cover browser target routing, dynamic tool guidance, task-local constraints/evidence, automatic title privacy and adapter contracts. The macOS arm64 DMG (803,507,918 bytes) and ZIP (837,357,977 bytes) passed package checks. Patch 6 was subsequently installed in `/Applications/eLLMsha.app`, preserving the real profile, and evaluated through retained synthetic QA chats. Task-context reconciliation and CodeGraph passed. Background browser input timed out; native guidance acceptance was blocked by account-plugin auto-attachment despite an empty selected MCP list. That candidate did **not complete full acceptance**; the cumulative Patch 7 disposition above records the subsequent scoped result. Local evidence: `.data/acceptance/patch6-live-2026-10-12/README.md`. Commercial projects were not test fixtures; no release was published.

## Patch 5 — 2026-10-11

- Scoped retrieval, project aliases, exact IDs, recency, source caveats and explicit completeness/degraded status have focused Rust, TypeScript and gateway contract coverage. Explicit context searches now use the same project binding as memory searches.
- Installed acceptance exercised 17 gateway cases and enumerated 224 distinct sources across three pages without duplicates. These are bounded checks, not a claim that every possible question is covered.
- Fresh GPT and Qwen chats recovered the main latest-task fact. Identical-source comparisons and native runs still exposed a Qwen factual-detail/caveat limitation; native timings were one run with different provider wrappers, not a hardware benchmark.
- Scoped chat-history listing/read-back and cross-project rejection passed. Two standalone continuation cases have planner test coverage rather than independent native-turn proof.
- Fourteen actual code graph MCP calls exercised allocation, query, release and reload; persistent index content remained unchanged. Current-architecture tool use is guided, not programmatically mandatory. A full memory reindex tool remains deferred until coordinated service restart and rollback are available.
- The installed Patch 5 baseline retained the real profile and displayed synchronized component metadata. The final release refresh includes the subsequent explicit-search metadata and context-scope repairs; package and installed checks are recorded with the release artifacts.
- Final required push gates passed: AionCore **8,397 tests passed, 26 skipped**; AionRS **2,248 passed, 2 skipped**; AionUI **3,354 passed, 5 skipped**. Lint, formatting, TypeScript, i18n, migration and dependency checks passed where prescribed by each component. Stale test fixtures were aligned with existing fork behavior; packaging tests now isolate their output from production artifacts. No new test skips were introduced.
- Public release inputs exclude local acceptance logs, profiles and customer-specific fixtures. macOS signing remains ad-hoc; Claude inference, Windows/Linux builds and cross-version managed CLI rollback remain outside the verified scope.

## Earlier installer and integration evidence

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
