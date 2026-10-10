---
name: plugin-authoring
description: Create, validate, install, update, enable, disable, or remove an eLLMsha plugin, portable Agent Plugin, Codex plugin, or Claude plugin with skills and MCP servers.
---

# Plugin authoring

Use the existing eLLMsha plugin registry through `"$AIONUI_HELPER_BIN" config plugins ...`. Do not discover ports, call raw backend routes, copy files into user data directly, or edit registry state files.

## Supported package inputs

- Native eLLMsha: `aion-extension.json`.
- Portable Agent Plugins: root `plugin.json`, root `skills/`, and optional root `mcp.json`.
- Codex compatibility: `.codex-plugin/plugin.json`, declared/default `skills/`, and optional `.mcp.json`.
- Claude: `.claude-plugin/plugin.json`, declared/default `skills/`, and optional `.mcp.json` or inline `mcpServers`.

eLLMsha executes imported skills and stdio, HTTP, SSE, or streamable HTTP MCP servers. It reports other package components as unsupported. Hooks, commands, agents, apps/UI, LSP servers, workflows, channels, monitors, output styles, and host user configuration are not executed. Do not remove unsupported declarations to make an import appear fully compatible; explain the diagnostics to the user.

Imported MCP tools remain approval gated. Never add a permission bypass or lifecycle hook to automate approval.

## Author a portable plugin

1. Start from `templates/basic-plugin` in this plugin directory, or create the same portable layout.
2. Give the plugin a stable kebab-case name. Keep skill names stable across updates.
3. Keep all declared paths relative and inside the plugin. Do not use `..`, symlinked components, or absolute paths.
4. Put reusable instructions in `skills/<name>/SKILL.md` with valid YAML `name` and `description` fields.
5. For an MCP server, use the least powerful transport and declare accurate behavior. The bundled sample is a local, side-effect-free echo server.
6. Inspect current capabilities before installation:

```bash
"$AIONUI_HELPER_BIN" config capabilities
```

7. Install a local package with stdin JSON:

```bash
"$AIONUI_HELPER_BIN" config plugins install <<'JSON'
{
  "type": "local_path",
  "path": "/absolute/path/to/plugin"
}
JSON
```

Install from Git with:

```bash
"$AIONUI_HELPER_BIN" config plugins install <<'JSON'
{
  "type": "git",
  "url": "https://example.com/owner/plugin.git"
}
JSON
```

8. Read the returned catalog and report the package format, supported components, warnings, and every unsupported component.
9. A successful install or update becomes available to new turns, resumed conversations, and child agents after the registry generation changes. It does not interrupt a tool call already in progress.

## Lifecycle commands

List and read compatibility diagnostics:

```bash
"$AIONUI_HELPER_BIN" config plugins list
```

Enable or disable globally by sending `{"name":"my-plugin","scope":"global"}` to `config plugins enable` or `config plugins disable`. Use project scope only when the user asks for existing project-specific behavior and include the existing `project_id`.

Remove a user-installed plugin only after the user requests removal:

```bash
"$AIONUI_HELPER_BIN" config plugins uninstall <<'JSON'
{
  "name": "my-plugin"
}
JSON
```

Built-in and environment-provided plugins cannot be removed by this command.

## Verification

After installation, list plugins again and verify the stable plugin ID, format, components, and enabled state. In a new turn, verify the skill is discoverable. Invoke MCP tools only when useful and with the normal approval behavior. For updates, preserve the previous installed version if validation fails and report the exact validation error.
