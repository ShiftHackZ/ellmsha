# Clockify integration provenance

This built-in plugin reuses eLLMsha v2's Clockify transport, report bounding, time entry preflight, and delivery uncertainty behavior under the project's existing license.

Clockify API reference: https://docs.clockify.me/

The v3 account model intentionally replaces v2's immutable local project binding. Each API key is stored as an independent encrypted connection, while provider workspace and project are selected per tool call.

Live acceptance requires a person to paste a newly generated Clockify API key for the correct data region. Clockify authenticates this integration with `X-Api-Key`; there is no OAuth consent step. Native QA should verify reads first and must not create, update, or delete real time entries without separate explicit authorization.
