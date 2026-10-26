# Embedded Copilot IDE provider

## Desktop use

Agents → Copilot IDE → Edit → Enable → Sign in and verify → Refresh models.
All connection settings live in the agent detail page. Ollama configuration also
lives in its existing agent detail page; neither provider adds a list banner.
The connection action sends one short harmless verification request and lets
Code OSS show its own GitHub/model-access consent dialogs.
Select the **Copilot IDE** agent when creating a chat, then choose one of its
models. Its model picker is restricted to the connected Copilot IDE catalog. The native
eLLMsha engine continues to own tools, permissions, MCP, skills, child agents,
memory preflight, history and Usage. This is a separate model provider; it does
not replace the existing organization-controlled Copilot CLI adapter.

Opening settings, enabling the provider and restoring an enabled configuration
create no Code OSS process. Only Sign in, Refresh models or an actual completion
starts the owned IDE runtime. Simultaneous requests share one startup. Active
requests prevent user/idle shutdown. Five idle minutes stop the runtime; its
private user-data/extension/shared-data/COPILOT_HOME paths remain intact. Real
HOME is retained for the existing login Keychain. GitHub credentials stay with
Code OSS; eLLMsha never copies its OAuth token. A new runtime uses the same
profile and does not request login again unless GitHub revokes/expires access.

Disable blocks new requests and preserves the profile. It refuses to interrupt
active requests. App shutdown stops Core first, then the owned IDE main process.
A parent watchdog asks Code OSS to quit if the owning application disappears.
The VPS web UI is unchanged and exposes no native lifecycle controls.

## Resources and build

The independently source-built runtime and extension use public `vscode.lm`.
Apply `background.patch`, build as described in README.md, then run:

```sh
node scripts/copilot-ide/stage-runtime.mjs --source /absolute/source-checkout
```

This stages generated, Git-ignored runtime resources under
`aionui/resources/copilot-ide`. Electron Builder copies these and the tracked
bridge extension into `Resources/copilot-ide/{runtime,extension}`. No user profile
or auth data is part of that resource tree. Packaged builds ignore development
source overrides. A build without staged runtime shows an unavailable provider.
The initial staging deliberately keeps the known working source build and its
native dependencies; it is several GB and has not been optimized. The local
macOS package passed nested signing, notarization and Gatekeeper acceptance.
Windows/Linux distribution and dependency pruning still need acceptance.

Development uses `ELLMSHA_COPILOT_IDE_SOURCE` or the existing acceptance checkout;
production uses only application-owned bundled resources.

The machine-readable transport contract is
`aionui/packages/desktop/src/process/resources/copilot-ide/openapi.json`.

## Transport contract

Both local listeners bind `127.0.0.1` on ephemeral ports. Each requires a random
Bearer credential and rejects browser Origin headers. The outer credential is
stored through the existing encrypted provider API; the inner credential stays
in owned process memory/environment. Neither is a GitHub credential. The
private readiness file contains only a nonce, process ID and loopback port.

- `GET /v1/models`: `{object:"list",data:[{id,object:"model",owned_by,context_window}]}`.
  The outer endpoint returns a saved catalog without waking Code OSS. Explicit
  Refresh obtains a current catalog, with a bounded wait for Copilot registration.
- `POST /v1/chat/completions`: OpenAI Chat Completions messages, `model`, optional
  `stream`, function `tools`, `tool_choice`, `max_tokens`/`max_completion_tokens`,
  and `temperature`. Requests are capped at 8 MiB. The chosen model must match
  exactly; there is no silent fallback. Text and tool-call/result history are
  translated into public LM message parts. The bridge never executes a tool.
- Streaming emits role/text/tool-call deltas, finish reason, available real
  provider usage counters and `[DONE]`. Missing counters are omitted.
- Errors have `{error:{type:"copilot_ide_error",code,message}}`; they never contain
  raw authentication/provider error messages. Cancellation propagates from the
  HTTP response closing to the provider CancellationToken. Timeouts are bounded.
- Native IPC `ellmsha:copilot-ide` accepts exactly `status|enable|disable|login|refresh|stop`
  from the owning main window. Responses contain lifecycle flags and model IDs,
  never credentials, arbitrary command paths or user-selected executables.

Public stable LM message roles are User and Assistant. Harness system/developer
instructions are preserved in order as a labeled first User message; this is
not equivalent to an API-level system role. Images are explicitly disabled.
Optional Copilot continuation metadata is not persisted; the engine sends full
conversation history after a runtime restart. Unsupported message/response parts
fail explicitly. Advanced reasoning controls and every catalog model are not
covered by the initial acceptance. No proprietary API/identity-header bypass or
organization policy changes are used.

## Acceptance — 2026-10-22

- Focused tests: lazy startup, private endpoint auth, concurrent first-use startup,
  refusing shutdown during active work, exact model selection, tool conversion,
  input validation, streaming frames and provider usage forwarding.
- Native lazy-provider acceptance: real Claude Haiku tool/result HTTP roundtrip;
  idle shutdown; authenticated catalog after restart without another sign-in.
- Native eLLMsha agent acceptance: separate Core/profile/workspace, Read/Write of
  an unpredictable synthetic marker; actual provider Usage counters. The fixture
  uses an explicitly empty local guidance stub and does not claim production
  memory acceptance. Production application/chats were not modified.

Evidence: `.data/acceptance/copilot-embedded-runtime-2026-10-22/`.
