---
name: figma-design-work
description: Connect Figma accounts through Settings or the signed-in in-app browser; inspect Figma designs, nodes, images, folders and comments through account-specific tools.
---

# Figma design work

Use the bundled Figma plugin's account-specific MCP tools. It uses Figma's REST API with personal access tokens (PATs), not Figma's separately approved official MCP service. It can inspect designs and export nodes; it cannot edit arbitrary canvas objects or claim official MCP write-to-canvas support.

## Choose an account for this operation

- Each connected account has an independent `figma-…` tool namespace, credentials and verified provider user ID. Use `figma_whoami` on the intended namespace to identify it.
- Choose the account from the user's request and verified identity. If several accounts could match, ask which one. Do not silently try every account, use another identity after a permission error, or permanently bind a project directory to an account.
- Credentials never belong in chat, tool arguments, shell commands/history, files in a project, source control or durable memory. Never ask the user to paste a token into chat.
- All agents use the same plugin runtime registry. If a new connection's tools have not appeared, finish this turn and discover them on the next turn. Do not claim a tool was used if it was not available.

## Connect an account

Manual setup: **Settings → Plugins → Figma → Connect account** accepts a PAT privately and verifies `/v1/me` before encrypted storage. **Reconnect** replaces a token for the same Figma user only; a different user needs a separate connection. **Disconnect** removes the saved local token and revokes its tools for subsequent runtime snapshots. It does not revoke the token at Figma.

### Browser-assisted setup (desktop)

When the user asks to connect the Figma account already signed in to the in-app browser:

1. List the authorized in-app tabs with `browser_tabs_list`. Choose the exact Figma tab and take a fresh snapshot. Confirm the intended identity if the user has several accounts. Use that exact stable `tab_id` for every browser action.
2. In Figma's account menu, open **Settings → Security → Personal access tokens**. Generate a new, clearly named token only as part of the user's requested account connection. Do not change website passwords, MFA, organization settings or other tokens. If sign-in, account selection or organization consent requires the human, leave that step to them.
3. Request `current_user:read` for identity verification. Add `file_content:read` for designs/exports; `folders:read` for folder browsing; `file_comments:read` for reading comments. Add `file_comments:write` only when the user wants comment writes. Choose the token lifetime with the user if it was not specified. Do not request unrelated scopes.
4. After generating the token, **do not snapshot its value, evaluate it, read the clipboard, inspect the token-creation network response, or copy it into a tool argument**. Use field metadata from the earlier snapshot or a DOM query that returns only tag/label/selector metadata to locate the one token field.
5. Call `browser_figma_connect_account` with only the stable `tab_id` and the CSS `selector` of that exact token field. Supply `connection_id` only for an explicitly requested reconnect. The private bridge reads one field on the trusted Figma origin, verifies ownership and the provider identity, and returns only public connection metadata.
6. Report the verified account identity. Refresh **Settings → Plugins → Figma** to see it. Close the token-generation dialog using its normal control. Do not revoke the newly imported token.
7. If import times out, inspect the plugin's account list before retrying. Never generate duplicate tokens blindly. If the browser runtime lacks private import, use the Settings form; never fall back to putting tokens in shell or chat.

Browser-assisted import requires the desktop's scoped in-app browser. Manual PAT connection and Figma tools also work in WebUI/Docker, where API requests run on the server. A website session alone is not a REST API credential.

## Inspect a design

1. Take the file/branch key from the user's Figma URL: `https://www.figma.com/design/<file-key>/<name>?node-id=1-2`. Decode a URL node ID to the provider form `1:2`. Never construct a key from a display name.
2. Start with `figma_get_file` at depth 2. Then use `figma_get_nodes` for the relevant nodes. Requests accept at most 50 node IDs and depth 1–10. Narrow oversized results instead of claiming a partial or withheld result is complete.
3. Use `figma_export_images` to get expiring PNG/SVG/JPG/PDF URLs; a null entry is a failed render, not a blank image. The tool does not download arbitrary URLs. Inspect design screenshots, layout, tokens and the existing code before implementing UI; do not treat generated guesses as source design data.
4. Use `figma_list_team_folders` with a team ID from the user's team URL, then `figma_list_subfolders` / `figma_list_folder_files`. These enumerate one level at a time. There is no API to discover every team ID. Never imply that one folder is an exhaustive account-wide inventory.

## Comments and failures

- Read through `figma_list_comments`. Post through `figma_add_comment` only when the user authorizes the exact target and comment/reply. Preserve the normal permission prompt. This writes externally and is not idempotent.
- After a timed-out comment, inspect comments before retrying; the first post may have succeeded.
- On 401/403, explain the account, expiry, scope or resource-permission issue; reconnect the intended account. On 429, honor Retry-After and provider plan limits. Do not bypass them by switching accounts without authorization.
- Do not infer available scopes merely from successful `/v1/me`; resource operations enforce their own scopes and plan access.

References: https://developers.figma.com/docs/rest-api/personal-access-tokens/ · https://developers.figma.com/docs/rest-api/users-endpoints/ · https://developers.figma.com/docs/rest-api/file-endpoints/ · https://developers.figma.com/docs/rest-api/folders-endpoints/ · https://developers.figma.com/docs/rest-api/comments-endpoints/
