# How eLLMsha works

![Runtime architecture](assets/architecture.svg)

## From a message to a result

1. The desktop sends the conversation and selected agent/model to AionCore.
2. The session adapter starts or resumes that agent, supplying the workspace, available skills, tools and permission mode.
3. The agent reads files, retrieves memory, calls integrations and can delegate bounded work. Tool results return to the originating session.
4. The interface renders messages, approvals and parent/child activity. Subagent histories remain independently inspectable.
5. Durable findings can be written to Tencent memory and read back by another chat or child agent.

## Responsibilities

| Layer | Owns | Does not replace |
| --- | --- | --- |
| AionUI | Desktop UI, native lifecycle, browser bridge | Agent reasoning |
| AionCore | Conversations, adapters, projects, plugin loading and tool routing | Provider authorization |
| AionRS / external coding agents | Model interaction and task execution | Human acceptance of the result |
| Tencent memory | Durable notes, knowledge and code indexes | Full chat history or source control |
| Plugins | Skills, MCP capabilities and integration configuration | Runtime permission enforcement |

## Models and embeddings

Generation jobs originating in a chat use its selected-model callback. Embeddings have their own provider/model/dimension configuration. Mixing vectors from different embedding spaces is invalid even if their lengths happen to match. Switching the embedding model therefore requires reindexing; selecting another chat model does not.

## A project with several repositories

The primary folder establishes the project context. Attached roots extend the agent's working set. Repository discovery and indexing operate per Git repository; project search aggregates those results. A successful search across several indexes is not a synthesized dependency graph spanning all repositories.

Index updates are explicit. Relocating the primary folder can change the memory namespace and requires a deliberate migration. Workspace scoping within the shared local identity is not a security boundary between mutually untrusted users.

## Storage and lifecycle

Installed application files are replaceable. Chats, settings and native memory live outside the installation in the platform application-data directory. On macOS, the ordinary profile is `~/Library/Application Support/eLLMsha Desktop`. Development and release builds share it unless an explicit QA override is supplied; never run both against that profile simultaneously.

Flatpak has its own application-data namespace. Server deployments persist application state and memory volumes separately. Back up a consistent set of chat state, memory data and private identity/configuration; copying only a notes directory is not a full restore.

## Extensions

Plugin packages can contribute skills and MCP tools. The installer accepts repository roots and selected subdirectories, records source revision and preserves it during updates. Immutable GitHub tree URLs can be used directly. Ambiguous branch/ref paths require explicit fields. Imported tools still use the runtime's approval policy. Compatibility covers skills and MCP servers; imported hooks, commands, agents, apps/UI and other unsupported components are reported rather than executed.

Linear and Clockify accounts are independent connections, without mandatory folder-to-account bindings. When several accounts could match a request, the agent must resolve the intended account rather than guessing.

## Deployment shapes

- **Desktop:** Electron, local backend and bundled native memory child processes. Docker is unnecessary.
- **Server:** WebUI/backend plus memory services on a private Docker network, persistent storage and explicitly mounted workspaces. Electron's native browser bridge is not present in the WebUI container.

See [maintainer reference](maintainer-notes.md) for detailed implementation history and [release status](release-status.md) for verified boundaries.
