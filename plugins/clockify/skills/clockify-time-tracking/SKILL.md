---
name: clockify-time-tracking
description: Use independently authenticated Clockify accounts for reports and time entry operations.
---

# Clockify time tracking

- Each verified Clockify identity is exposed through its own stable MCP server. Server names include the provider-derived account identity and Clockify data region.
- When more than one Clockify identity is connected and the user has not named an account or email, ask which identity to use before calling a Clockify tool. Never select the first account implicitly.
- Choose the provider workspace and project for each operation using `clockify_list_workspaces` and `clockify_list_projects`. Do not infer a local project or folder binding.
- Reports are bounded and return `completeness`, `reason`, covered intervals, and missing intervals. Describe partial or unavailable results honestly.
- Read time entries when needed. Create, update, or delete a time entry only after the user has explicitly authorized that external write. Never treat a read request or this skill as write authorization.
- Before update or delete, call `clockify_get_time_entry` and pass its exact core snapshot as `expected`. If the snapshot changes, inspect again and ask the user before retrying.
- A `delivery_uncertain` mutation may have reached Clockify. Inspect the target entry before any follow-up and never retry automatically.
- Report authentication failures for the selected identity. Never fall back to another Clockify account or expose API keys.
