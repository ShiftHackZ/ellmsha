---
title: 'AWS sign-in with a USB security key on macOS'
type: feature
created: '2026-10-28'
status: in-review
baseline_commit: 74ad109f57f544c1c5b249cb5612325eee3a73b0
context: [aionui/AGENTS.md, docs/browser-profiles.md]
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** The user's AWS/YubiKey attempt produced no dialog/progress. Electron44.9.2 cancels PIN requests; the exact failed stage is unknown.

**Approach:** Support registered USB keys through a dedicated WebAuthn bridge backed by maintained libfido2. No managed Apple browser entitlement or Electron fork.

## Boundaries & Constraints

**Always:** macOS, top-level HTTPS, explicit public-key get only; reject platform-only requests. Preserve sandbox/contextIsolation/webSecurity, tasks and project profiles. Bind ceremonies to trusted origin/document, visible tab and profile generation; lazy native loading.

**Ask First:** Account/key interaction, human PIN/touch, production restart/install/publication. Specification only is authorized.

**Never:** iCloud passkeys, Bluetooth/NFC/hybrid, conditional autofill, cross-origin frames, VPS changes, private Apple APIs, generic device access, automatic PIN retries/reset. No secrets in logs, telemetry, agents or evidence. Unsupported get features fail explicitly; create/non-public-key calls retain native behavior.

## I/O & Edge-Case Matrix

| State | Behavior |
|---|---|
| Matching key | Choose device, PIN if needed, touch; return assertion |
| Missing/unplugged | Cancellable bounded wait/error |
| Incorrect PIN | Show retries; human decides; never guess |
| Hidden/stale document | Cancel once; discard late results |
| Unsupported request | DOMException before device access |

</frozen-after-approval>

## Code Map

Expand prefixes: `D=aionui/packages/desktop`, `S=D/src`, `W=S/process/services/browser/webauthn`.

- `S/process/services/browser/{popups,profiles}.ts`: native views, lifecycle and canonical ownership.
- `S/preload/main.ts`: privileged app APIs; NEVER attach to websites.

## Tasks & Acceptance

**Execution:**

- [x] `W/native/{build.cjs,securityKey.cc,dependencies.lock.json}`: Node-API adapter using libfido2 1.17.0; lock/checksum dependency sources/licenses. Support enumerate/get, PIN/UV/retries. No custom CTAP/crypto or runtime Homebrew.
- [x] `W/{index,worker,policy}.ts`: disposable utility process from trusted packaged paths, sanitized environment; no PIN in argv/env. Bound inputs/outputs/timeouts; serialize hardware access and dispose its worker on cancel. Validate actual origin/RP/public-suffix, allowCredentials, algorithms and UV without downgrade; construct clientData/hash. Legacy HTTPS AppID requires same-registrable-domain authorization including private suffix boundaries, without network facet retrieval; unsupported extensions reject before prompting.
- [x] `S/common/types/browserWebAuthn.ts`, `S/process/bridge/{browserWebAuthnBridge,index}.ts`: typed contracts; derive sender/frame/tab/profile from main ownership, never page claims. Require visible tab and trusted human confirmation.
- [x] `S/preload/{browserWebAuthnPreload,browserWebAuthnPage}.ts`, `S/process/services/browser/{popups,profiles}.ts`: early main-world shim via separate sandboxed preload for ordinary/popup views. Only WebAuthn IPC; preserve binary/credential methods, AbortSignal/DOMException. Cancel on real navigation/hide/profile switch/destruction; settle once, never advertise platform support.
- [x] `S/renderer/pages/conversation/Preview/browser/SecurityKeyDialog/{index.tsx,dialog.html,main.tsx,SecurityKeyDialog.module.css}`, `S/preload/securityKeyPreload.ts`, `S/renderer/services/i18n/locales/*/settings.json`: Arco device/PIN/touch/cancel UI in a separate app-owned modal window above native views, excluded from browser CDP/MCP. Show verified origin/RP/retries; clear PIN after use. Dialog focus is not a tab switch; genuine scope changes still cancel.
- [x] `D/electron.vite.config.ts`, `D/electron-builder.yml`, `aionui/scripts/{afterPack,afterSign}.js`, `docs/component-licenses.md`: emit dedicated preload/dialog/utility-worker entries, package/unpack dependencies. Verify architecture/nested signatures; retain signing/notary/Gatekeeper gates. Skip native loading outside macOS.
- [x] `aionui/tests/unit/preview/browser/webauthn/*`, `aionui/tests/e2e/features/previews/usb-security-key.e2e.ts`: matrix, forgery/AppID/UV, worker packaging, overlay/focus, stale/concurrent results, redaction, encoding and profile regressions.
- [x] `docs/browser-profiles.md`, `.data/acceptance/usb-security-key-2026-10-28/`: document limits; retain sanitized results tied to source/candidate hashes.

**Acceptance Criteria:**

1. Given a signed candidate and registered AWS USB key, when the human completes login/PIN/touch, then AWS accepts authentication and shows Console in the originating profile.
2. Given a test RP credential already registered through Chrome, when real-page get completes, then server verification passes; virtual tests are insufficient.
3. Given cancel, blocked PIN, unplug or worker failure, when the ceremony ends, then its document receives one bounded error and the app/tasks remain responsive.
4. Given projects A/B/default, when a ceremony completes or scope changes, then only its originating profile receives results/cookies; stale requests cannot resume.
5. Given a packaged candidate on a clean Mac, when authentication runs, then bundled libraries load without build tools, managed browser entitlement or weakened security/signing.

## Spec Change Log

- 2026-10-28 review loop2 (bad_spec): prescribed renderer-root entries worsened its existing directory-size violation. Re-derive only affected UI entry/placement wiring under the existing browser feature directory. KEEP: isolated libfido2 transport, trusted modal, public API semantics, profile guards, source/synthetic test evidence and all unrelated code. No frozen intent changes.

- 2026-10-28: User approved implementation ("Ok, try to implement"). This supersedes the earlier specification-only authorization; hardware/account interaction and production installation remain gated. Frozen intent otherwise unchanged.

- 2026-10-29 compatibility repair: replace the unnecessarily required same-site AppID facet fetch with Chromium-compatible private-suffix-aware registrable-domain authorization. KEEP: exact raw AppID, RP/frame/profile ownership, cancellation, trusted confirmation and isolated native transport. No live AWS root cause or hardware acceptance is claimed.

## Design Notes

USB credentials differ from Apple Passwords. Prototype transport first; inspect actual AWS request requirements without saving secrets. Do not repeat the failed stock test or count a chooser as authentication proof.

## Verification

In `aionui`: `bun run test`, `bunx tsc --noEmit`, `bun run lint`, `bun run format:check`, `bun run i18n:types`, `node scripts/check-i18n.js`, native error-path tests. Verify isolated signed candidate; later installation requires idle tasks and reversible backups.

Sources: [Electron](https://github.com/electron/electron/blob/v44.9.2/shell/browser/webauthn/electron_authenticator_request_client_delegate.cc), [libfido2](https://developers.yubico.com/libfido2/).

## Implementation evidence — 2026-10-28

Source tasks and review repairs are implemented; status remains in-review pending real hardware and packaged acceptance. Full UI suite: 3,767 passed / 5 skipped; first review-repair suite: 65 passed; final native-policy/controller/page suite: 46 passed. The 3,767-test full suite preceded the last two narrowly scoped repairs; final affected checks were rerun afterward. Types, lint, format, i18n and four signing contracts passed. Checksum-pinned dependencies build for macOS13.0; the static addon has system-only dynamic dependencies and passes Node/Electron utility-process load/error probes without device access. A compiled HTTPS Electron44 fixture passed with synthetic transport, trusted Light/Dark modal, empty PIN screenshot and cancellation; this is not hardware authentication. Exact receipts and protected installed-app hashes: `.data/acceptance/usb-security-key-2026-10-28/implementation-acceptance.json`. All twelve actionable review findings were repaired, including absolute AppID cancellation, strict binary/API semantics, human-denial error handling and authenticator list/ID/message-size limits. Physical key/AWS/already-registered test-RP and signed packaged candidate acceptance remain PENDING. No real key/account access, production restart/install, commits or push occurred. This implementation remains unstaged under the user's standing explicit-commit-only preference. BMAD status is deliberately not done because the specified real hardware/AWS and signed-package acceptance criteria have not passed.

## Local installation acceptance — 2026-10-28

User authorized reinstall. Version `2026.10.28-patch.2` (About UI27/Core21) was Developer ID signed, accepted by Apple notarization, independently verified and installed only after repeated complete idle checks. Signature policy parity, exact signing leaf, designated requirements, secure timestamps, hardened runtime, stapled ticket, Gatekeeper and packaged native source/dependency/executable-text provenance passed. The installed USB addon exactly matches the accepted candidate. Native About and restored project/chat sidebar were observed.

The graceful reversible installation retained the old app and private quiescent SQLite backup, then normal-profile startup/integrity and all313chat IDs /32,983message IDs were verified preserved, with no additions or missing records. App remains running; no commit/push/publication or real key/account operation occurred. Evidence: `.data/acceptance/usb-security-key-install-2026-10-28/acceptance.json`, `candidate-signing.json`, `installed-acceptance.json` and `native-about.png`. Status remains in-review: physical YubiKey/AWS/server-verified assertion and clean-Mac hardware acceptance are still pending.


## Suggested Review Order

**Ceremony ownership and lifecycle**

- Validate the originating document and bind every operation to its live profile.
  [index.ts:54](../../aionui/packages/desktop/src/process/services/browser/webauthn/index.ts#L54)

- Authorize RP and legacy AppID before prompting or accessing devices.
  [policy.ts:23](../../aionui/packages/desktop/src/process/services/browser/webauthn/policy.ts#L23)

**Page boundary and trusted interaction**

- Preserve credential API semantics through a narrow sandboxed main-world bridge.
  [browserWebAuthnPage.ts:4](../../aionui/packages/desktop/src/preload/browserWebAuthnPage.ts#L4)

- Route IPC through main-owned sender identities.
  [browserWebAuthnBridge.ts:9](../../aionui/packages/desktop/src/process/bridge/browserWebAuthnBridge.ts#L9)

- Keep origin, device selection and PIN input in an app-owned modal.
  [index.tsx:7](../../aionui/packages/desktop/src/renderer/pages/conversation/Preview/browser/SecurityKeyDialog/index.tsx#L7)

**Native transport**

- Load maintained libfido2 only inside the disposable worker.
  [worker.ts:38](../../aionui/packages/desktop/src/process/services/browser/webauthn/worker.ts#L38)

- Enforce UV and credential filtering without implementing CTAP or cryptography.
  [securityKey.cc:72](../../aionui/packages/desktop/src/process/services/browser/webauthn/native/securityKey.cc#L72)

**Packaging and verification**

- Build checksum-pinned native dependencies for the existing macOS deployment baseline.
  [build.cjs:47](../../aionui/packages/desktop/src/process/services/browser/webauthn/native/build.cjs#L47)

- Exercise compiled preloads and the trusted modal with isolated synthetic transport.
  [usb-security-key.e2e.ts:7](../../aionui/tests/e2e/features/previews/usb-security-key.e2e.ts#L7)

## AppID compatibility repair — 2026-10-29

A confirmed source compatibility defect fetched a facet list for sibling HTTPS AppIDs, while Chromium authorizes the same registrable domain without network retrieval, including private registries. The repair removes that fetch, preserves exact AppID bytes and pre-aborted cancellation, and retains HTTPS/credential/fragment/port/IP/cross-site restrictions. A synthetic top-level AWS-shaped regional caller with a sibling `extensions.appid` reaches the trusted dialog without network or hardware. Private-registry tenants, public suffixes, lookalikes and malformed caller origins reject. This does not establish the exact failed stage of the user's live AWS attempt.

Controller failures before a trusted dialog is shown now log only fixed stage enums (`platform`, `busy`, `ownership`, `request`, `profile`, `appid`, `dialog-create`, `dialog-load`); no URL, request, PIN or exception data is emitted. An unsuccessful dialog load settles rather than waiting for an unavailable error UI. Hardware/AWS/server and signed candidate acceptance remain pending; no production restart, account/key access, installation, commit or push is part of this repair.

Compatibility sources: https://chromium.googlesource.com/chromium/src/+/82bc6daa7ce65ca948f2555c42cd874bfd2df115/content/browser/webauth/webauth_request_security_checker.cc (same registrable domain AppID authorization); https://www.w3.org/TR/webauthn-2/#sctn-appid-extension (same-site AppID implementation note).

Repair validation: 62 focused WebAuthn tests pass across five files with pinned Bun and Node 24.11.0; workspace TypeScript checking and touched-file formatting/lint pass (eight existing lint warnings, zero errors). Three independent narrow BMAD reviews found no confirmed production defect; added a normalization-sensitive raw-AppID regression from the blind review. Expected pre-dialog cancellations retain fixed-stage diagnostics because identifying the cancellation stage is the reported problem. Downstream hardware/server assertion acceptance remains pending.


## 2026-10-29 — production dialog packaging repair

The installed Patch 1 dialog opened blank, then timed out. Exact installed renderer assets reproduced `Cannot read properties of undefined (reading createContext)` in a private Electron fixture with no hardware/account operations. The production manual-chunk matcher incorrectly included scoped React wrappers such as `@monaco-editor/react` in React core, introducing an initialization cycle. Exact package-segment matching repairs the shared local/CI build configuration. The shared macOS afterPack hook now requires the worker, both dedicated preloads, dialog HTML and every referenced script/style asset.

The modal stays hidden until React commits; startup/load/crash/unresponsive failures close and settle it, with native Escape/close independent of the renderer. Existing API failure codes are preserved. The fixture now builds all production renderer entries with the actual configuration, suppressing only Sentry upload credentials for QA. Its real Electron flow passed confirmation, synthetic assertion, PIN UI, Light/Dark, Cancel, actual AbortSignal, Escape/native close, and missing-module hidden startup failure. Final focused suite: 88 tests passed; full TypeScript, touched-file lint/format and i18n checks passed. Three independent reviews and their repair rechecks are clean. Evidence: `.data/acceptance/usb-security-key-dialog-2026-10-29`.

Version metadata is 2026.10.29-patch.2 / UI29 / Core21 for the requested next local signed build. Installation is pending and must wait for every actual runtime task to finish. Real YubiKey/AWS server-accepted authentication remains pending; spec status stays in-review.


## 2026-10-29 — installed Patch 2 and user AWS acceptance

Developer ID signed and notarized `2026.10.29-patch.2` / UI29 / Core21 was installed after repeated complete idle checks. Normal-profile startup, signatures, database integrity and all 329 conversation IDs / 36,818 message IDs passed preservation checks. Native About confirms the expected build. Evidence: `.data/acceptance/usb-security-key-dialog-install-2026-10-29/acceptance.json`, `installed-acceptance.json` and `native-about.png`. The reinstall monitor was deleted; the app remains running.

The user subsequently confirmed successful AWS Console sign-in in the in-app browser. This is user-reported real-site acceptance, not an agent-observed assertion trace; the exact key model/protocol was not collected. The user also reported that the same method did not work for Google and successfully used another 2FA method; its exact failure cause is unverified. No agent key/PIN/touch/account operation occurred. Clean-Mac hardware acceptance and the remaining broader hardware matrix are still pending, so the specification remains in-review.
