# eLLMsha v3 pilot

The v3 control plane combines forked AionUi/AionCore with TencentDB Agent Memory and global BMAD/Ponytail skills. Desktop and Docker build from the checked-out forks. Local changes can be reviewed and merged independently from upstream updates.

## Layout

| Path                                  | Purpose                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aionui/`                             | [ShiftHackZ/ellmsha-AionUi](https://github.com/ShiftHackZ/ellmsha-AionUi): Electron/React desktop and WebUI frontend, based on `v2.1.47-final`. Apache-2.0.                                    |
| `aioncore/`                           | [ShiftHackZ/ellmsha-AionCore](https://github.com/ShiftHackZ/ellmsha-AionCore): agent runtime, based on `v0.1.58`, including automatic memory recall and global skill loading. MIT.             |
| `tencentdb-agent-memory/`             | [ShiftHackZ/ellmsha-TencentDB-Agent-Memory](https://github.com/ShiftHackZ/ellmsha-TencentDB-Agent-Memory): memory-core, memory-hub and optional model proxy. MIT.                              |
| `bmad-method/`                        | [ShiftHackZ/ellmsha-BMAD-METHOD](https://github.com/ShiftHackZ/ellmsha-BMAD-METHOD): twelve memory workflows in `ellmsha-skills/`, with optional upstream method references.                   |
| `ponytail/`                           | [ShiftHackZ/ellmsha-ponytail](https://github.com/ShiftHackZ/ellmsha-ponytail): six global skills. MIT.                                                                                         |
| `aionrs/`                             | Local patched source checkout of [iOfficeAI/aionrs](https://github.com/iOfficeAI/aionrs), pinned to `v0.2.8`, used by AionCore through Cargo path dependencies for native subagent MCP access. |
| `compose.yaml`, `docker/`, `scripts/` | Deployment and local launch configuration.                                                                                                                                                     |
| `.data/`, `workspaces/`               | Private local state and workspace mounts; ignored by Git.                                                                                                                                      |

The five published forks are root-level submodules, with the user's fork as `origin` and the original repository as `upstream`. Fetch and review upstream changes inside each checkout, merge or rebase there, then update the root submodule reference when ready. Current implementation changes remain local; launch/build commands do not commit or push. The additional `aionrs/` checkout is also local: its patched sources must be present beside `aioncore/` for desktop and Docker builds.

## Start on this Mac

The desktop application runs Tencent MemoryCore, MemoryKnowledge and MemoryPanel as native child processes using a bundled Node.js runtime. Docker and a separate Node installation are not needed by the installed memory runtime. Source development/builds require Node/npm, installed AionUi dependencies and Rust 1.95.0; AionUi uses a Bun lockfile. The default embedding service is Ollama with `bge-m3`; install the encoder or configure another compatible service.

```sh
git submodule update --init --recursive
# Keep the local patched aionrs/ checkout alongside the submodules.
scripts/v3.sh desktop-dev
```

`desktop-dev` prepares the native Tencent runtime, incrementally builds AionCore, and starts Electron Vite with live reload. It creates no distributable. Development and packaged launches share the persistent desktop profile; use `ELLM_SHA_USER_DATA_DIR` for an explicitly isolated profile. The script finds a standard Cargo installation or the local stable Rust toolchain; `ELLM_SHA_CARGO_HOME` selects a different Cargo cache (default `.data/cargo`).

For a packaged Apple Silicon app, run `scripts/v3.sh desktop-build`, then `scripts/v3.sh desktop`. Native runtimes must be built on the target OS/architecture; cross-platform and multi-architecture packaging are rejected rather than shipping the wrong executable. macOS native startup is verified; Windows/Linux packages still need platform acceptance testing.

### Persistent desktop data

The profile is `app.getPath('appData')/eLLMsha Desktop`:

- macOS: `~/Library/Application Support/eLLMsha Desktop`
- Windows: `%APPDATA%/eLLMsha Desktop`
- Linux: `$XDG_CONFIG_HOME/eLLMsha Desktop`, normally `~/.config/eLLMsha Desktop`

Chats live under `aionui/`; Tencent databases, snapshots, keys and logs live under `tencentdb/`. These directories are outside the installed app and are reused across updates. Native startup verifies/reuses the same identity and never recreates existing databases. The Windows uninstaller is configured to retain application data. This is persistence, not a versioned backup facility; copy the complete profile while the application is stopped for a consistent backup.

**Settings → Memory → Memory embeddings** configures an OpenAI-compatible endpoint, model and API key (including Ollama). **Check model** detects output dimensions without modifying the index. **Save and reindex** pauses memory services, rebuilds vectors on a database copy with progress, and switches configuration only after all records succeed. Failures and interrupted switches restore the previous database/configuration. The previous database remains in a private `embedding-backup-*` directory. Chats are unaffected.

`tencentdb/runtime-settings.json` configures local ports, the embedding provider, and allowed code workspaces. Generated gateway configuration is rewritten from those settings; edit the settings file while the app is stopped. Changing the encoder requires rebuilding vectors; changing the chat model does not. Desktop source mappings use the same absolute host path for `hostPath` and `servicePath`.

The existing pilot was copied into this persistent profile using `scripts/migrate-desktop-data.py`: 10 chats, 188 messages, 1715 atomic memory records, 2 Wikis and 1 code graph. The original `.data/aionui-desktop-dev` profile and Docker volumes remain intact. Migration requires stopped writers and refuses an existing destination. See `.data/acceptance/native-migration.json` for the local verification report.

### VPS / Docker Compose

```sh
scripts/v3.sh init
# Configure .env endpoints, embedding model, and optional allowed code mount.
scripts/v3.sh up
```

Compose remains available for server deployment. WebUI binds to `http://127.0.0.1:3000`, and Memory Hub to `http://127.0.0.1:8125`. `up` bootstraps a reusable identity and writes private configuration under `.data/tencentdb/`. `scripts/v3.sh down` retains data volumes. Do not run the local Compose memory services and desktop on the same ports simultaneously; the desktop rejects occupied ports.

Docker's build definition compiles the local UI/AionCore forks and sibling Aionrs sources and includes the same renderer, memory MCP and global skill packs. The Compose configuration and Docker build checks pass; a full build/run of this revised image still needs verification. The browser client reaches Memory Hub through the build argument `TDAI_PANEL_URL`; set a browser-accessible URL for a remote deployment. The local Compose binding remains `127.0.0.1`.

## Memory behavior

### Model selection

Ollama is available through **Settings > Agents > Set up Ollama** or **Settings > Model > Set up Ollama**. The preset discovers installed models at `http://localhost:11434/v1`, accepts a blank API key and uses Chat Completions. Select a model with tool support in a new **eLLMsha · Ollama / API** chat. Codex and Claude Code retain their backend-specific model lists. For a containerized agent, configure a Docker-reachable Ollama endpoint such as `http://host.docker.internal:11434/v1`.

Wiki synthesis and optional conversation extraction capture the originating chat's provider and selected model when the job is submitted. The captured model is retained for that job even when another chat uses a different model or the user changes the original chat later. Native models use the existing provider directly. Codex/Claude use an isolated generation session with the same selected model and existing authentication; Tencent receives an expiring callback capability, never the upstream credentials. The pilot sets `AION_LLM_REQUIRE_CONTEXT=1`: missing or expired chat context produces an error without falling back to a separate model. Manual generation initiated in the embedded Tencent panel has no originating chat and must be started from an agent instead.

Embeddings are configured separately in desktop Settings → Memory, or with `MEMORY_EMBEDDING_*` for Compose; the default is local `bge-m3`. All agents query the same search index and receive ordinary text. Switching the chat model does not rebuild the index. Changing the embedding provider/model/dimensions rebuilds vector tables in the current SQLite implementation; original memory texts remain stored. Concurrent per-encoder indexes are not implemented. Desktop changes use an offline staged rebuild with rollback; agents cannot use memory during the rebuild.

Live verification on 2026-10-09: Codex `gpt-5.6-sol` completed Wiki synthesis and L1/L2/L3 extraction with source readback. Native Ollama `qwen3-vl:8b` completed Wiki generation through the selected-model callback, but needed one steer to correct invented tool arguments. Its generated pages also added unsupported details, and its 1024-token summary budget produced no text. Native routing passed; factual quality did not. Claude live inference is not yet verified. Local evidence: `.data/acceptance/model-routing-core.json` and `.data/acceptance/model-routing-native.json`.

AionCore retrieves relevant memory before each dispatched agent turn, including ACP/Codex and delegated sessions. It supplies the selected workspace's stable scope and BMAD artifact prefix. Recall includes shared core guidance and up to four search hits, bounded to 8 KiB overall with a three-second request deadline. Retrieval failures are reported in the context, so ordinary work can continue with an explicit limitation.

The runtime also attaches the current TencentDB MCP configuration to agent sessions, replacing stale memory entries in old session snapshots. Nine memory tools provide scoped context, shared knowledge search/write, conversation search/archive, core read and scenario list/read/write. Agents can read a full source when a recalled excerpt is insufficient.

`tdai_memory_write` saves a durable fact under a stable subject path; `tdai_scenario_write` saves a complete Markdown document. Both synchronously update the searchable atomic record before reporting indexed success. Rewriting the same path updates that record. Conversation archive/extraction remains optional and asynchronous. Saving new outcomes still requires a successful agent tool call; failed writes must not be reported as persisted memory.

Workspace scope uses the canonical absolute path, a readable basename and a short hash. Different directories with the same basename remain separate. Parent and child agents receive the same configured TencentDB identity; the current pilot intentionally shares cross-project search within that identity. Moving a workspace to a different absolute path changes its scope and requires an explicit artifact migration.

The v2 migration report is stored locally at `.data/tencentdb-v2-migration/report.json`: the pilot imported 1715 full scenario documents and 1709 searchable records from 1716 source notes, excluding one possible credential-bearing note. The old Second Brain vault remains a separate migration source; ongoing v3 writes use TencentDB.

## Agent Wiki and local code index

Eight additional MCP tools expose Tencent MemoryKnowledge when `knowledgeUrl` is configured: `tdai_knowledge_catalog`, `tdai_wiki_ingest`, `tdai_wiki_search`, `tdai_wiki_read`, `tdai_code_index`, `tdai_code_search`, `tdai_code_explore` and `tdai_code_impact`. They reuse Tencent's existing services and storage. The catalog lists resources or reports the status/error of a known Wiki or code graph. Ingest and indexing are asynchronous; an accepted job is only queryable after its status is `ready`.

Wiki ingest accepts small Markdown/text source batches, reuses a stable name or Wiki ID and starts Tencent's synthesis pipeline. Generated pages can be searched and read by reference. `tdai_wiki_read` with `source=raw` reads the original upload even if synthesis fails; generated pages are a derived model output and must be checked against those sources. Full BMAD workflow documents remain authoritative in scenario memory; Wiki synthesis is a separate knowledge view.

The local code adapter snapshots a read-only mounted workspace, including uncommitted source, with Git ignore rules and explicit exclusion of secrets, generated directories and symlinks. `tdai_code_index` handles one Git workspace. For product folders use `tdai_project_index` instead. Running it again refreshes the same graph; search/explore/impact use the last completed snapshot, so refresh after source changes. Indexing is explicit, with no filesystem watcher in this pilot.

Local source access is opt-in. On desktop, **Files → Code indexes** discovers Git repositories within the primary workspace and attached project folders. **Index all** or **Index / update** grants local snapshot access to those repositories without a service restart; data remains in the persistent desktop profile. Standalone `tdai_code_index` paths outside those roots still require a configured `knowledgeWorkspaces` mapping. For Docker deployments, in `.env`, set `KNOWLEDGE_LOCAL_SOURCE_ROOT` and `KNOWLEDGE_LOCAL_MOUNT_ROOT` (default `/workspaces/ellmsha-v3`); the launcher mounts that root read-only into Memory Hub. Bootstrap writes the matching host-to-service mapping into the private memory configuration. Other projects need an explicit allowed mount and a `knowledgeWorkspaces` mapping; rerun bootstrap after changing the root. A blank source root leaves code indexing disabled. Knowledge management credentials are kept in that config and HTTP headers, never in MCP tool parameters. Desktop uses `http://127.0.0.1:8424`; Docker uses `http://memory-hub:8424`. Live MCP verification covered uncommitted source search, source exploration, dependency impact and refresh of the same graph ID; a real AionUi snapshot also indexed successfully. Wiki upload, retry, search and page/raw-source reads also passed through MCP. The configured small local model preserved the synthetic facts but invented a source URL in its generated page; this validates the integration, not factual reliability of every synthesized sentence. Synthetic test resources were removed after saving the local report at `.data/knowledge-smoke/report.json`.

## Global skills and BMAD artifacts

AionCore imports the eLLMsha, BMAD and Ponytail packs into its built-in global catalog at startup. New chats receive their catalog entries; slash menus merge them with native agent commands. Packaged desktop/WebUI artifacts include the packs, while source development reads the root submodules.

The twelve BMAD workflows use the runtime's exact `bmad/<project-scope>/` prefix. They list and read previous artifacts, save full Markdown and a searchable summary, then read the saved path back before reporting success. PRD, architecture, epics, sprint status, stories and reviews share predictable memory paths. A new chat or subagent can continue by listing that prefix; workflow outputs are stored in TencentDB rather than generated in the project repository. Optional v2 templates/checklists remain available without requiring old activation scripts or loading entire workflows into context.

Live Codex acceptance created a PRD with `tdai_scenario_write`, read it back, then used a fresh chat for the next workflow. A native Codex child with `fork_turns=none` independently wrote and read a consistency document, which its parent also read. The existing conversation's slash menu showed all twelve BMAD commands. These checks ran in the selected Auto permission mode with no pending approvals; permission behavior in other modes remains unchanged.

The app uses a private `ellmsha-codex-home` overlay for Codex-backed sessions. It removes the legacy v2 memory policy/plugin from that app profile while preserving unrelated user guidance and sharing authentication/session/tool resources through links. The user's original Codex configuration and the old v2 vault are not rewritten. This prevents a v3 agent from following the old fail-closed v2 memory route.

See [BMAD integration](bmad-method/ELLM_SHA_INTEGRATION.md) for the cross-session acceptance scenario. Other model/backend combinations still require their own acceptance checks.

## Desktop interface

The fork includes the eLLMsha theme, v2 Cheremsha artwork and animated rounded Dock frames. Settings > Memory embeds TencentDB Memory Hub and synchronizes its light/dark appearance with the desktop. **Use local identity** connects the local pilot; managed users enter their administrator-assigned `user_key`. The app verifies that the panel identity matches the agent configuration. Provisioning users/teams/agents remains an administrator operation.

Electron provides the in-app browser control bridge. Docker WebUI runs the same frontend without Electron's native browser bridge. Desktop control still requires an adapter and permission testing.

## Remaining limits

- TencentDB data persists in the desktop profile or server Docker volumes. The pilot does not yet provide a bidirectional human-editable Markdown vault or a complete portable import/export UI.
- Chats/projects remain in AionCore storage; backend/model compatibility and simultaneous multi-agent use need further acceptance testing.
- Scope isolation is by workspace path within a shared pilot memory identity. Per-project security boundaries and workspace relocation are not yet a product feature.
- The optional legacy TencentDB model proxy has one configured upstream model. Agent-originated Wiki/extraction jobs use the selected-model callback instead; recall and direct memory writes need only the separate embedding service.
- Remote automation containers require their own agent credentials and any additional host tools. Local-only Compose networking is not a public deployment configuration.

### Projects with several repositories

Open the product directory (for example `SequelCare` or `BlockalRavid`) as the primary workspace. It does not need a `.git` directory. Add codebases elsewhere using **Files → Add folder**. **Code indexes** lists each discovered repository and its Tencent status; indexing can target one or all. Discovery searches three directory levels, skips hidden/generated/worktree directories and symlinks, and stops at a Git root (its existing snapshot includes nested repos/submodules). Attach deeper repositories explicitly. The configured discovery budget is 2000 directories; failures are reported alongside usable roots.

Parent and subagents share `tdai_project_repositories`, `tdai_project_index`, and `tdai_project_code_search`. The conversation capability resolves fresh project roots on every request, so attached/detached folders affect catalog/search immediately. The application project ID identifies the result, and each canonical repository URL maps to its existing Tencent graph (no duplicate mapping database). Project-wide search preserves per-repository results, graph IDs, timestamps and errors; it is complete only when every selected index is ready and all searches succeed. This is federated symbol search, not a synthesized cross-repository dependency graph. Explore/impact still target a single graph.

Memory/Wiki/BMAD stay shared through the primary workspace's existing namespace; adding repositories does not split or migrate those documents. Changing the physical primary workspace path remains a separate memory migration concern. Index updates are explicit, not filesystem-watched. Compose deployments retain explicit host-to-container mappings and read-only mounts; the desktop project grant directory is not enabled there.
