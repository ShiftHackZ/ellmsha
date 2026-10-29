# Desktop browser project profiles

Desktop uses Electron `WebContentsView` tabs. Each authenticated owner/project pair has a separate persistent Chromium `Session`; all ordinary chats belonging to that owner share a separate Default session. Workspace strings, page URLs and renderer storage do not establish profile identity. Project renames preserve the stable identity. Children inherit their authenticated parent lineage; inconsistent or missing lineage fails closed.

Cookies (including HttpOnly), localStorage, IndexedDB, service workers, Cache Storage, HTTP cache and HTTP authentication belong to the selected Chromium session. Browser tab restoration and back/forward history belong to that profile, independently of document preview workspace scopes. Switching chats or profiles hides and retains live native pages, including POST responses, forms and opener relationships; returning does not navigate or resubmit them. The existing global tab limit also bounds retained hidden pages, and opening beyond it is rejected. Switching profiles never copies cookies or authentication. Restart history stores and restores only URL/title entries and the active index, never opaque Chromium pageState or POST bodies; it cannot preserve an in-memory POST response across app exit. Old `persist:aionui-browser` data remains quarantined; new profiles require a one-time sign-in.

The settings catalog stores a verified profile ID, canonical project ID and up to eight recent conversation references, never tokens or site URLs. It refreshes ownership/labels through Core within an eight-second overall budget. Deleted or moved references can recover through a bounded fresh owned-conversation lookup; one invalid binding does not suppress unrelated profiles. Every recovered reference must match the original verified profile identity. Clearing one selected profile closes its native pages, clears storage/cache/authentication, and discards its saved tab state; other profiles remain intact.

Retained hidden pages count toward the existing global tab limit. Settings offers an explicit **Close suspended tabs** action with an unsaved-changes confirmation to recover capacity, including pages whose original conversations were deleted. It preserves the active profile's pages and all Chromium cookies, storage and sign-ins. It does not automatically evict pages or increase the resource limit.

The clearing catalog requires a surviving owned conversation to revalidate a profile. If none remains, its stored session is inaccessible through the catalog rather than guessed or reassigned; the suspended-tab action can still close its retained pages. This does not automatically erase orphaned session files.

## Identity and transport

The Electron host keeps a random issuer key in module memory. It passes the key explicitly only to the Core child, which captures it into process-local memory and removes it from the environment before creating worker threads. Agent subprocesses, native shell tools and MCP children receive only a signed owner/conversation/project capability. The key is never persisted, sent to the renderer, logged or added to an agent launch environment.

Core rechecks canonical owned records after lazy project binding. Canonical project rows with kind `temp` are internal ordinary-chat workspaces and map to browser Default, even though their stored project IDs differ; standard user projects retain their canonical identity. This browser-only normalization does not change conversation or memory project bindings. The host proves each identity request with a domain-separated HMAC over the exact conversation ID. The endpoint rejects all Origin-bearing requests, even those with a valid proof; ordinary local-mode API access cannot mint browser identities. Main/renderer attachment generations reject delayed commands and inventory cleanup after scope changes.

CDP HTTP discovery and WebSockets require a scoped capability URL. The old public `/json/version`, `/json/list` and unscoped global token are rejected. Each command and ordered event batch revalidates the capability against Core. Target inventories, sessions and events are filtered by profile. Unknown Target/Browser/Storage commands and browser-context overrides are rejected. Background agents cannot switch the user into another profile. The pinned browser MCP connects using the scoped WebSocket endpoint, never by launching a hidden Chrome.

## Core HTTP contract

`GET /api/conversations/{id}/browser-context` is a desktop-host-only read endpoint, in addition to the existing authenticated-owner middleware. It has no request body. `{id}` is a required canonical conversation ID. `x-ellmsha-browser-proof` is required and equals base64url without padding of HMAC-SHA256(issuer key, UTF-8 `ellmsha-browser-context-v1:` followed by the exact decoded conversation ID). Header values and response tokens must never be logged.

Successful JSON:

```json
{
  "success": true,
  "data": {
    "conversation_id": "owned-conversation-id",
    "project_id": "registered-project-id-or-null",
    "project_name": "current-project-name-or-null",
    "token": "transient-signed-capability"
  }
}
```

`project_id` and `project_name` are JSON `null` for confirmed ordinary chats. They are not omitted. `token` is an opaque string, not a profile name or a reusable global API credential. Its claims are bound to owner, conversation and project; the Electron process lifetime and fresh ownership validation constrain reuse.

Errors use the existing Core `ErrorResponse`: 401 for missing required user authentication in authenticated mode; 403 for absent/invalid host proof or any Origin header; 404 for a missing or foreign conversation; 500 for unresolved project/lineage/backend identity. Errors must never be interpreted as Default. Reassignment or deletion invalidates an existing capability on the next action/event authorization. This GET does not require CSRF; it accepts only a main-process proof and uses the existing read-time lazy-binding behavior.

## Electron IPC contract

- `app.bind-browser-profile({conversationId: string | null})` resolves an owned chat or suspends browser access. Success data: `{profileId, conversationId, label: string | null, token, generation: number}`. A failed/late resolution has no Default fallback.
- Native popup commands, tab registrations and inventories carry the transient `profileToken` and current `generation`, plus their existing exact tab/mount IDs. Main revalidates before acting; stale generations fail.
- `app.list-browser-profiles()` returns freshly resolved registered profile contexts with `openTabCount: number`; it does not activate a profile.
- `app.close-suspended-browser-tabs()` closes only main-owned native tabs outside the active profile and returns `{closedTabs: number}`. It requires an explicit UI confirmation; no Core capability or website data access is involved. A reset event removes their persisted UI tabs, without clearing Chromium storage or authentication.
- `app.clear-browser-data({profileToken})` clears only the freshly authorized selected profile. `app.browser-profile-cleared({profileId})` invalidates renderer tab/history state after successful clearing.
- Success/failure use `IBridgeResponse<T>` (`success`, optional `data`, optional `msg`). Credentials/tokens are never placed in persistent renderer state.

## Runtime and authentication limits

Electron is pinned to 44.9.2. `better-sqlite3` is pinned to 13.0.3, whose upstream N-API implementation replaces the V8-dependent 12.x addon that failed against Electron 44. The private actual Electron runtime passed SQLite create/write/read and integrity checks; this does not replace browser acceptance. Its exact release API documents `select-webauthn-account`: account selection is bound to the visible profile/frame, and cancellation, navigation, timeout or failure invokes the callback exactly once. No unconditional HID/USB grants or signing entitlement changes are introduced. OS/hardware credential stores are distinct from Chromium cookies and are not claimed to be partitioned by project.

Chromium embedding does not guarantee Google OAuth acceptance. Google can prohibit embedded user agents regardless of cookie isolation. External Chrome or account migration would be a separate design. The macOS USB integration's AWS acceptance and remaining limits are recorded below; virtual WebAuthn tests alone are not hardware proof.

Web/VPS retains its existing browser implementation. Private full-app QA uses `AIONUI_E2E_TEST=1` and isolated user/session data; it must not register the production `aionui://` protocol or overwrite installed files.

Verification status and source-bound results are retained separately under `.data/acceptance/desktop-browser-project-profiles-2026-10-20`; implementation is not a claim that every native/hardware scenario has passed.

## USB security-key sign-in on macOS

The source implementation adds a dedicated, sandboxed `navigator.credentials.get()` adapter for top-level HTTPS pages. A separate app-owned modal names the actual requesting origin and RP, asks for consent, then offers USB keys and, when required, a masked PIN field. The PIN is never returned to the website or browser MCP. Device operations run lazily in one disposable Electron utility process; navigation, hidden/minimized host, tab/profile changes, cancellation and timeout terminate that ceremony. Existing project cookie/storage isolation remains unchanged. The physical key's credentials are not partitioned by eLLMsha projects.

The adapter uses maintained libfido2 1.17.0, statically linked with pinned libcbor and OpenSSL into a Node-API addon. Checksum-verified sources and the pinned build tools are cached by architecture, compiler and deployment target; the addon targets macOS13.0 and has only system dynamic dependencies. Packaging checks actual Mach-O architecture/deployment target, preserves dependency notices and requires the selected Developer ID signature. No runtime Homebrew installation, managed Apple browser-passkey entitlement, private Apple API or Electron fork is used.

This release scope is explicit USB-key **assertion** only. Credential creation retains Electron's existing native behavior. Apple/iCloud passkeys, platform-only requests, conditional autofill, cross-origin frames, Bluetooth/NFC/hybrid transport and unsupported extensions are outside scope. Legacy AppID first tries the RP-scoped assertion, then an authorized AppID fallback only when no credential matched and required UV would not be downgraded. HTTPS AppIDs within the same registrable domain (including private suffix boundaries) preserve their exact string and are authorized without DNS or HTTP, matching Chromium’s same-site behavior. Credentials, fragments, IP literals, nondefault AppID ports and broader facet relationships are rejected explicitly. Failures before the trusted dialog is shown log only a fixed stage enum; no origin, request, PIN or exception text is logged. Credential lists are filtered by the selected key’s advertised maximum ID length (255 bytes for U2F) and split to its list capacity and advertised message-size budget (a conservative encoded upper bound includes RP/hash/options/PIN-UV overhead); only genuine no-credential results advance to another batch. A filtered nonempty list never becomes a discoverable request. CTAP2.0’s omitted descriptor is recovered only from a sole allowed credential. Incorrect PINs require another human submission; the app never guesses or resets a key. Normal ceremony expiration and trusted human denial/dismissal return `NotAllowedError`; dismissing an existing failure preserves its established code. Explicit page abort and navigation return `AbortError`.

Acceptance remains separated: source/unit checks and a real Electron44 HTTPS fixture with **synthetic transport** establish preload, IPC, native addon loading, modal/PIN rendering and cancellation. On 2026-10-29, the signed and notarized `2026.10.29 Patch 2` / UI29 / Core21 build was installed, and the user confirmed successful AWS Console sign-in in its in-app browser. This is user-reported real-site acceptance; the exact key model and protocol were not collected. Google sign-in with this method did not work in the user's test; another 2FA method succeeded, and the exact failure cause remains unverified. Clean-Mac hardware checks, other key models/sites and an already-registered test RP assertion remain pending. Source/synthetic evidence is retained at `.data/acceptance/usb-security-key-2026-10-28/`; signed installation, preservation checks and the user-reported AWS outcome are recorded at `.data/acceptance/usb-security-key-dialog-install-2026-10-29/acceptance.json`.

Sources: https://raw.githubusercontent.com/electron/electron/v44.9.2/docs/api/session.md ; https://developers.google.com/identity/protocols/oauth2/policies .
