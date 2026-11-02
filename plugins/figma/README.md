# Figma

Enable **Settings → Plugins → Figma** and connect one or more accounts using personal access tokens. Account identities are verified through Figma's `/v1/me`; tokens are encrypted with the existing application credential key. Reconnect rotates a token for the same account. Disconnect removes the local token; revoke it separately in Figma if needed.

The built-in account tools inspect files/nodes, export images, browse team folders/subfolders/files, read comments and post explicitly authorized comments. Each identity has its own namespace. User-facing configuration and runtime snapshots are scoped to the signed-in eLLMsha user. Agents choose an account for each operation; ambiguous requests require a choice.

Required scope: `current_user:read`. Optional scopes: `file_content:read`, `folders:read`, `file_comments:read`, `file_comments:write`, according to the work requested. Figma enforces token expiry, sharing permissions, plan access and rate limits.

On desktop, an agent can help generate a PAT in an already signed-in Figma in-app browser tab, then use `browser_figma_connect_account` to import it privately. This returns only verified account metadata. The same token can be entered privately in Settings. WebUI/Docker supports the Settings form and the account tools; private browser import requires the desktop scoped browser.

This is an eLLMsha REST integration, not Figma's official MCP service. Figma currently requires new MCP clients to join its approved catalog. Arbitrary canvas editing and official MCP-only tools are not part of this PAT plugin.

- [Token setup](https://developers.figma.com/docs/rest-api/personal-access-tokens/)
- [REST scopes](https://developers.figma.com/docs/rest-api/scopes/)
- [Official MCP client requirements](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
