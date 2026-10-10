# Upstream

- Linear MCP endpoint: `https://mcp.linear.app/mcp`
- Setup and multiple-workspace guidance: https://linear.app/docs/mcp
- OAuth proxy: `mcp-remote@0.14.3` (MIT), executed through `npx` and not vendored.
- Each eLLMsha connection receives its own `MCP_REMOTE_CONFIG_DIR` under persistent app data.
