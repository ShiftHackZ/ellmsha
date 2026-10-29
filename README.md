<div align="center">

<img src="docs/assets/cheremsha-pet.png" alt="Cheremsha, the eLLMsha desktop pet" width="240" height="260" />

# eLLMsha

**e**xtensible **L**arge **L**anguage **M**odel **s**mart **h**arness **a**rchitecture

### One workspace for your agents, code and project memory.

**Cloud models · Local models · Persistent context · Tools you can extend**

[How it works](docs/architecture.md) · [Working effectively](docs/workflows.md) · [Build desktop](scripts/release/README.md) · [VPS deployment](docs/vps-deployment.md) · [Release status](docs/release-status.md)

</div>

![eLLMsha architecture at a glance](docs/assets/architecture.svg)

## Why eLLMsha exists

A product rarely fits in one repository or one chat. The backend, web app and mobile client evolve together; decisions outlive a conversation; a useful agent needs access to the tools where work actually happens.

eLLMsha brings those pieces into one desktop harness. Use your preferred coding agent, keep durable project knowledge in memory, work across several codebases and follow delegated work without losing its history.

## What's special about eLLMsha

- **Project rules arrive before the task.** A project's remembered rules are loaded before its prompt is executed, including delegated work. Decisions, BMAD specifications and reusable findings stay available when you open a fresh chat or choose another agent.
- **One product can span several repositories.** Attach the backend, frontend and mobile client to the same project. Memory stays with the project; source indexes and search retain each repository's identity.
- **Build an agent team on a diagram.** Auto Router separates the root model, default subagents and task classifier. Add model overrides for coding, QA or research, choose a cost/speed/quality priority, and keep independent settings for automatic, semi-automatic and manual modes. Available routes follow each adapter's capabilities.
- **A desktop browser with project-specific sign-ins.** Real Chromium tabs keep cookies, storage and history separate between projects. Chats within a project share its browser profile; ordinary chats share a separate default profile. On macOS, use an existing USB security key to sign in without leaving the workspace; AWS Console sign-in has been confirmed in the installed app.
- **Useful tools without an enormous starting prompt.** Skills and MCP tools are discovered and loaded as needed. Per-chat and global Usage views expose token consumption and context composition, distinguishing reported counters from estimates or unavailable measurements.
- **Several work accounts, one workspace.** Connect multiple Linear, Notion and Clockify identities. Agents can use the appropriate account without permanently binding a project folder to it; ambiguous requests require an account choice.

**The desktop bundles its backend, memory services and their runtime.** No Docker setup is needed for desktop memory. Cloud/API models, installed coding agents and local Ollama models use the same project workspace.

<details>
<summary><strong>See the desktop plugin catalog</strong></summary>

![Plugin catalog in the installed desktop application](docs/assets/plugins-desktop.png)

Actual installed macOS build, captured on a test profile without connected accounts.

</details>

<details>
<summary><strong>See memory and embedding settings</strong></summary>

![Memory settings after a local embedding rebuild](docs/assets/memory-desktop.png)

Installed macOS test profile after rebuilding its fixture with a 768-dimensional local embedding model. No account credentials are shown.

</details>

## Desktop app

<p>
  <a href="https://github.com/ShiftHackZ/ellmsha/releases/latest"><img src="docs/assets/download-macos.svg" alt="Download eLLMsha for macOS — Apple silicon" height="72"></a>
  <a href="https://github.com/ShiftHackZ/ellmsha/releases/latest"><img src="docs/assets/download-windows.svg" alt="Download eLLMsha for Windows — x64" height="72"></a>
</p>

Choose the **macOS Apple silicon DMG** or **Windows x64 EXE** on the [latest release page](https://github.com/ShiftHackZ/ellmsha/releases/latest). macOS releases are Developer ID signed and notarized; Windows installers are currently unsigned.

1. Install the app and open a project folder. Attach additional repositories from the Files panel when needed.
2. Choose an agent and model. For local inference, configure Ollama and download a suitable model.
3. Open **Settings → Memory** to select the embedding model, and **Settings → Plugins** to connect your work accounts.
4. Give the agent a task; inspect its tools, delegated work and Usage alongside the conversation.

**USB security-key sign-in on macOS.** Connect a key already registered with the website, start sign-in in an in-app browser tab, and follow eLLMsha's confirmation, PIN and key-touch prompts. Successful AWS Console sign-in was confirmed in the signed local `2026.10.29 Patch 2` build. This integration covers USB keys; Touch ID/iCloud passkeys and new-key registration are outside its scope. Google sign-in with this method has not passed verification; another 2FA method was used successfully. See [browser authentication support and limits](docs/browser-profiles.md#usb-security-key-sign-in-on-macos).

To build from source, clone the exact maintained component revisions:

```bash
git clone --recurse-submodules https://github.com/ShiftHackZ/ellmsha.git
cd ellmsha
```

Follow the [desktop build guide](scripts/release/README.md). The root commit pins component revisions; `main` uses `ellmsha-main` integration branches in the forks.

## Hosted docker instance

Run the browser-based workspace on a **Linux amd64 VPS or local Linux machine** with Docker Engine and Compose v2. The published [`ghcr.io/shifthackz/ellmsha-web:latest`](https://github.com/ShiftHackZ/ellmsha/pkgs/container/ellmsha-web) image includes the WebUI, AionCore and AionRS.

Save this as `docker-compose.yml` in a new deployment directory:

```yaml
name: ellmsha
services:
  ellmsha:
    image: ghcr.io/shifthackz/ellmsha-web:latest
    platform: linux/amd64
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:${ELLM_SHA_PORT:-3000}:3000"
    environment:
      AIONUI_PORT: "3000"
      AIONUI_ALLOW_REMOTE: "true"
      AIONUI_DATA_DIR: /data
      AIONUI_OPEN_BROWSER: "0"
    volumes:
      - ellmsha-data:/data
      - ${ELLM_SHA_WORKSPACES:-./workspaces}:/workspaces
    extra_hosts:
      - host.docker.internal:host-gateway
volumes:
  ellmsha-data:
```

```bash
mkdir -p workspaces
docker compose pull
docker compose up -d
```

Open **http://127.0.0.1:3000**. On first launch, `docker compose logs ellmsha` shows the generated login credentials; sign in and change the password in the UI. On a VPS, connect from your computer with `ssh -N -L 3000:127.0.0.1:3000 user@your-vps`, then open the same address. The example keeps the published port local to the host; use an authenticated HTTPS reverse proxy when providing public access.

| Environment variable | Purpose |
| --- | --- |
| `AIONUI_PORT=3000` | HTTP port inside the container; keep it aligned with the image's startup command and port mapping. |
| `AIONUI_ALLOW_REMOTE=true` | Allows the WebUI server to listen beyond container loopback. The host port above remains bound to `127.0.0.1`. |
| `AIONUI_DATA_DIR=/data` | Persistent application state, including chats, settings and connections. Keep the `ellmsha-data` volume across updates. |
| `AIONUI_OPEN_BROWSER=0` | Prevents an attempt to launch a desktop browser in the container. |
| `ELLM_SHA_PORT` | Compose setting for the host port; defaults to `3000`. |
| `ELLM_SHA_WORKSPACES` | Compose setting for the host project directory mounted at `/workspaces`; defaults to `./workspaces`. Mount only repositories the agents should access. |

**Shared memory uses additional services.** The example above starts the agent workspace. To enable the memory panel, persistent project memory and code indexes, follow the [full memory-stack bootstrap and Compose guide](docker/README.md#first-installation-bootstrap-once-then-use-pull-only-compose). That setup creates the private identities, configuration and persistent volumes required by the services. Use the following published images for the stack:

| Image | Contains |
| --- | --- |
| `ghcr.io/shifthackz/ellmsha-web:latest` | WebUI, application backend and native agent engine |
| `ghcr.io/shifthackz/ellmsha-memory-core:latest` | Durable memory and search |
| `ghcr.io/shifthackz/ellmsha-memory-hub:latest` | Memory settings panel, Wiki and code-index services |
| `ghcr.io/shifthackz/ellmsha-memory-proxy:latest` | Optional model proxy |

Set the full-stack guide's `ELLM_SHA_WEB_IMAGE`, `MEMORY_CORE_IMAGE`, `MEMORY_HUB_IMAGE` and optional `PROXY_IMAGE` overrides to these references. Its `MEMORY_EMBEDDING_*` settings choose the search encoder independently of chat models; `KNOWLEDGE_SERVICE_KEY` and the private memory connection files come from bootstrap. See [.env.example](.env.example) for the complete configuration. For updates, pull and recreate containers while retaining application and memory volumes. `latest` follows the current published release; release tags and the digests in `images.json` are also available when you need a fixed version.

Desktop Chromium tabs and the embedded Copilot IDE runtime are desktop features; the hosted WebUI runs in your existing browser.

## Memory that follows the project

Chat generation follows the originating agent/model. Semantic search uses a separately configured embedding model: changing a chat model does not require re-embedding your project. Changing the embedding space does require rebuilding its vectors.

Memory stores decisions and reusable context. Chat history preserves what happened. Code indexes help locate and explore source. Each has its own lifecycle and contributes a different part of the project's context.

## Extend it with your agent

Built-in integrations live in `plugins/<plugin>`. Start with the [plugin-authoring skill](plugins/plugin-dev/skills/plugin-authoring/SKILL.md) and its [minimal template](plugins/plugin-dev/templates/basic-plugin). Describe the service, required tools and account flow; ask the agent to implement and verify the plugin in a bounded task. Keep credentials in connection settings, outside the plugin source.

## Built on maintained forks

These four forks form the application itself. We adapt them together so project context, tools and delegated work can follow a task through the interface, session layer and agent runtime.

| Component | Role |
| --- | --- |
| [AionUI](https://github.com/ShiftHackZ/ellmsha-AionUi/tree/ellmsha-main) | **Desktop and WebUI.** Our changes add project-isolated Chromium tabs with USB security-key sign-in on macOS, the visual routing editor, Usage dashboards, multi-account plugin settings and bundled service lifecycle management. |
| [AionCore](https://github.com/ShiftHackZ/ellmsha-AionCore/tree/ellmsha-main) | **Application and agent-session backend.** We added project-rule preflight, on-demand tool discovery, routing and usage plumbing, project-scoped channel sessions, and account-aware integrations. |
| [AionRS](https://github.com/ShiftHackZ/ellmsha-aionrs/tree/ellmsha-main) | **Native agent engine.** Our integration connects project memory, skill/tool loading and subagent execution to the harness's session and routing policies. |
| [TencentDB Agent Memory](https://github.com/ShiftHackZ/ellmsha-TencentDB-Agent-Memory/tree/ellmsha-main) | **Persistent memory, Wiki and source indexes.** We added project guidance and searchable workflow artifacts, per-repository indexing, and generation callbacks that use the originating chat's model while embeddings remain independently configured. |

The root pins exact fork commits. Integration branch names follow `ellmsha-<root-branch>`; upstream provenance and eLLMsha patch numbers are visible in **About**. Original authors retain their licenses and credits; see the [component license inventory](docs/component-licenses.md).

## Bundled tools

These are shipped alongside the core as skills, plugins or tool runtimes. Service integrations require your own accounts and permissions; desktop/device automation requires the corresponding local environment.

| Component | Role |
| --- | --- |
| [BMAD Method](https://github.com/ShiftHackZ/ellmsha-BMAD-METHOD/tree/ellmsha-main) | **Bundled skill suite** — planning, specifications, architecture, implementation and review, adapted to store shared artifacts in project memory. |
| [Ponytail](https://github.com/ShiftHackZ/ellmsha-ponytail/tree/ellmsha-main) | **Bundled skill suite** — simplicity-focused implementation, review and technical-debt workflows. |
| [Mobile MCP](https://github.com/ShiftHackZ/ellmsha-mobile-mcp/tree/ellmsha-main) | **Bundled plugin + MCP runtime** — interact with connected Android/iOS devices and simulators. |
| [Chrome DevTools MCP](https://github.com/ShiftHackZ/ellmsha-chrome-devtools-mcp/tree/ellmsha-main) | **Bundled MCP runtime** — inspect and automate browser pages through the maintained browser integration. |
| [Open Computer Use](https://github.com/ShiftHackZ/ellmsha-open-codex-computer-use/tree/ellmsha-main) | **Bundled plugin + native MCP runtime** — operate desktop applications through their accessibility interfaces. |
| [Linear](plugins/linear) | **eLLMsha plugin + skill** — multiple OAuth accounts, issues, projects, comments and attachments through Linear's hosted MCP. |
| [Notion](plugins/notion) | **eLLMsha plugin + skill** — multiple OAuth identities/workspaces for pages, databases, search and comments through Notion's hosted MCP. |
| [Clockify](plugins/clockify) | **eLLMsha plugin + skill** — independent API-key accounts, time reports and approval-gated time-entry changes. |
| [Plugin Authoring](plugins/plugin-dev) | **eLLMsha plugin + skill/templates** — create, validate and install compatible plugin packages, including selected Git subdirectories. |
| [Copilot IDE bridge](scripts/copilot-ide/PROVIDER.md) | **Bundled desktop provider/runtime** — use Copilot models through an isolated, lazily started Code OSS extension host with persistent sign-in. GitHub account and organization access policies still apply. |
| [eLLMsha setup and troubleshooting](aionui/resources/ellmsha-skills) | **Built-in skills** — configure agents, memory and WebUI deployment, and diagnose the installed harness. |
| [REA](https://github.com/morluto/rea) | **Bundled skill** — reverse-engineer an existing codebase and its architecture. |
| [Hallmark](https://github.com/Nutlope/hallmark) | **Bundled skill** — develop more deliberate visual designs. |
| [Humanizer](https://github.com/blader/humanizer) | **Bundled skill** — edit formulaic AI writing into more natural prose. |
| [Impeccable](https://github.com/pbakaus/impeccable) | **Bundled skill set** — audit and refine interface design. |
| [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | **Bundled skill + reference data** — UI patterns, typography, colors and design-system guidance. |
| [Last 30 Days](https://github.com/mvanhorn/last30days-skill) | **Bundled skill + scripts** — research recent discussions and trends; source access may require additional credentials. |
| [Scrapling](https://github.com/D4Vinci/Scrapling) | **Bundled skill + examples** — guide web scraping with Scrapling; install its Python/browser dependencies when using it. |
| [Diagram Design](https://github.com/cathrynlavery/diagram-design) | **Bundled skill** — create and refine technical diagrams. |

The catalog supports enabling plugins, connecting accounts and installing additional packages from Git. Bundled skill sources and pinned revisions are recorded in [the community source manifest](aionui/resources/ellmsha-skills/community/SOURCES.json).

## Project status

| OS | Desktop app | Docker image |
| --- | --- | --- |
| macOS | ✅ arm64 / Apple silicon | ✅ Linux amd64 via Docker Desktop; emulated on Apple silicon |
| Windows | ✅ x64 / x86-64 | ✅ Linux amd64 via Docker Desktop / WSL2 |
| Linux | ❌ No published desktop package | ✅ amd64 / x86-64, native Docker Engine |

Docker packages are **Linux amd64** images. Other host architectures need [emulation](https://docs.docker.com/build/building/multi-platform/); Linux arm64 images are not currently published. See [releases](https://github.com/ShiftHackZ/ellmsha/releases) for available installers and image versions.

---

**Copyright © 2026 Moroz Inc.** Original root-repository material is licensed under [AGPLv3](LICENSE) (`AGPL-3.0-only`), with a separate paid commercial licensing option. Commercial use under AGPLv3 remains permitted. Upstream components retain their own licenses. See [licensing and commercial inquiries](LICENSING.md).
