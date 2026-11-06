# Automation Secrets

Secrets is an optional built-in plugin for credentials intentionally shared with automation. Enable it in **Settings → Plugins → Secrets**, create a vault with a passphrase, and add records there or from the chat sidebar's key icon. Temporary chats can access global records. Standard project chats can access global records and that project's records. Projects retained after removal from the active picker remain manageable in Settings; they are never reassigned by a matching name or path.

Records support login, API key, secure note and structured fields. Add explicit service, environment, tenant, role and exact website/application/CLI target bindings. Different environments may intentionally share one record or use separate records. Required or unknown MFA means the agent must ask the human to finish authentication. Codes, seeds, recovery codes and passkeys do not belong in this vault.

## Agent access and approvals

The plugin exposes global/project list, read, write and delete tools, plus history search and masking. Tools use the existing Aion approval flow, including its current mode and once/session/persistent options. Approval does not widen conversation scope. The backend rechecks owner, project, plugin state and vault identity before executing. No separate Secrets approval setting is introduced.

Explicit reads return **raw usable credentials to the model/provider**. Owned tool cards and canonical tool projections hide sensitive arguments/results, but the model may echo them, use them in another tool, or transmit them to a website. Provider retention, terminal/browser logs and existing exports are outside this vault. Store only credentials you intentionally want automation to use. Do not write them to memory, rules or skill files.

Metadata listings contain titles and environment bindings, never field values. The human editor masks values until reveal/copy, and clears raw state on lock, chat switch and plugin disable. Record updates/deletes require the current metadata incarnation and revision; a conflict requires refreshing and reviewing the latest version.

## Storage, locking and recovery

Each owner has an isolated encrypted vault in the backend data directory's `secrets-vault.sqlite`. AES-256-GCM encrypts record values and metadata; an Argon2id-derived key wraps a random vault key. The passphrase is not recoverable. Keep an encrypted backup and its passphrase if you need recovery. Restore replaces the owner's vault only after validating the complete backup; it does not merge records.

The encrypted stored snapshot (records plus permanent idempotency receipts) and a 1 KiB deletion reserve per live record share a 32 MiB limit. Ciphertext uses fixed-length base64 encoding; the reserve guarantees space to delete each existing record and keep its retry receipt. Receipts are never silently pruned. Operation UUID spellings are normalized before retry matching. Writes and restores that exceed it are rejected before replacing the vault. Base64 backup files remain below 43 MiB and fit the 64 MiB import limit, so a successfully committed vault can always be exported and restored. Individual records remain limited to 64 KiB.

Use **Lock** to remove the decrypted key from backend memory. Idle keys expire after fifteen minutes; background metadata polling does not prolong that timer. Desktop lock-screen events also request a lock and clear editor state. Changing the passphrase preserves the records and invalidates the old optional device wrapper. Restarting the backend requires unlocking again.

Desktop users can opt in to an OS-protected device wrapper. It uses Electron safeStorage and is unavailable when Linux has no supported secret-service backend; there is no plaintext fallback. Forgetting the device removes only that convenience wrapper. WebUI uses the passphrase flow and cannot export or import a raw device key.

## Finding and masking previous chat credentials

History search is opt-in and scoped to the current project, current chat, or owned temporary history. It scans user text by default; assistant/tool payloads require explicit opt-in. Search returns heuristic candidates and continuation cursors. Follow every page if a complete bounded scan is needed; oversized messages are reported as skipped. A zero-result page is not proof that history contains no credentials.

Select candidate handles explicitly before masking. The backend validates their caller, scope, expiry and message revisions and applies the selected payload replacements atomically. Actively written targets are rejected. Later stale stream updates cannot restore the old canonical content. Future canonical exports/forks see the edited text; existing forks, exports, SQLite WAL/backups, model/provider retention and live runtime context are **not erased**. Masking does not interrupt a running agent or rotate a leaked credential.

## Remote WebUI deployment

The Core HTTP listener does not terminate TLS itself. Secrets WebUI requests are accepted directly only from an authenticated loopback connection with a loopback Host/Origin. Cookie `Secure`, `Forwarded` and `X-Forwarded-Proto` are not accepted as evidence of encryption.

For a remote WebUI, use a TLS-only reverse proxy on the same host and bind the Core origin to loopback. Configure a private random capability of at least 64 characters in `AIONUI_SECRETS_TLS_PROXY_CAPABILITY` for the backend process and configure the proxy to **overwrite** the `X-Ellmsha-Secrets-Tls-Proxy` request header with that value. The proxy must reject unencrypted requests, strip any client-supplied copy of the capability header, and keep the value out of client code, responses and access logs. Do not expose the origin port or proxy an HTTP listener to it. The backend checks the actual socket peer is loopback and requires the capability on every WebUI Secrets request in this mode. Normal JWT authentication and CSRF checks remain required. A missing or incorrect capability fails closed; it is not an authentication substitute.

The desktop human capability is separately generated per launch, held by Electron main, and consumed by the backend before spawning agents. Runtime tokens and renderer calls cannot use the device-key routes.

Restore rotates an authenticated UUID incarnation while keeping record IDs, revisions and operation receipts. Update/delete requests must include the incarnation and revision returned by current metadata. Stale mutations are rejected before receipt lookup, including when a restored branch reuses a revision. Re-read and re-approve after restore; idempotent retries remain deterministic within an incarnation. The fixed 36-byte incarnation preserves the snapshot/deletion-reserve size bound.
