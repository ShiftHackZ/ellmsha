---
name: linear-project-work
description: Use independently authenticated Linear MCP connections for issues, projects, comments, and attachments.
---

# Linear project work

- Every verified Linear identity is available through its own stable MCP server. Server names include the verified workspace and account email.
- When more than one Linear identity is available and the user's request does not identify an account or workspace, ask which identity to use before calling a Linear tool. Never choose the first connection implicitly.
- Read issue, project, and comment data when needed for the task. Create, update, or delete Linear content only when the user has explicitly authorized that external write.
- Keep issue and comment changes scoped to the selected verified workspace. Report authentication failures instead of falling back to another Linear identity.
- Use `get_attachment` for attachment records and `extract_images` for images embedded in Linear markdown when those tools are present.
- Linear issue descriptions can contain native `<linear-image>{JSON}</linear-image>` nodes even though `extract_images` accepts Markdown. The current macOS/Linux account adapter normalizes these nodes for `extract_images` automatically. On older plugin revisions or Windows, run `node scripts/normalize-linear-images.mjs` from this skill directory with the content on stdin, then pass its stdout to the same account-specific tool. Both paths only convert exact HTTPS `uploads.linear.app` image URLs without fetching or storing them.
- Keep signed upload URLs transient: do not save normalized output, copy URLs into project files, or include them in reports. Malformed nodes, Markdown-unsafe URLs, and other origins stay unchanged and must not be fetched directly.
- Tool availability proves the server contract only; report unsupported media, byte limits, expired URLs, and inaccessible private uploads from the actual tool result. External attachment URLs remain metadata-only when `get_attachment` refuses their content; do not bypass that boundary.
- Never expose OAuth tokens, authorization headers, or the local MCP auth directory.
