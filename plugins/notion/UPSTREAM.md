# Notion integration

This eLLMsha plugin connects to Notion’s official hosted MCP endpoint,
https://mcp.notion.com/mcp. It does not fork or redistribute Notion’s service.
OAuth and Streamable HTTP use the existing pinned mcp-remote@0.14.3 bridge
(the same transport used by Linear). Each connection has its own private auth
directory; neither tokens nor those paths are returned by the account API.

Identity is verified with the documented `notion-get-self` tool. Tool inventory
is discovered from the authenticated server. Availability and access depend on
Notion permissions, workspace settings, and plan.

Sources checked 2026-10-28:
- https://developers.notion.com/guides/mcp/build-mcp-client
- https://developers.notion.com/guides/mcp/mcp-supported-tools
- https://github.com/punkpeye/mcp-remote

Notion brand SVG: https://github.com/simple-icons/simple-icons/blob/develop/icons/notion.svg

Reconnect keeps the namespace for the same verified identity. Selecting a different
Notion user or workspace rotates the namespace and approval identity so agents
cannot mistake it for the previous account.
