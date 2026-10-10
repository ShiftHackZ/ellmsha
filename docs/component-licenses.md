# Component licenses and source provenance

This inventory covers the nine maintained integration forks in this checkout. It does not replace their license texts or enumerate every transitive package dependency.

| Component | License text | Declared license |
| --- | --- | --- |
| [AionUI](../aionui/readme.md) | [LICENSE](../aionui/LICENSE) | Apache-2.0 |
| [AionCore](../aioncore/README.md) | [LICENSE](../aioncore/LICENSE) | Apache-2.0 |
| [AionRS](../aionrs/README.md) | [LICENSE](../aionrs/LICENSE) | Apache-2.0 |
| [TencentDB Agent Memory](../tencentdb-agent-memory/README.md) | [LICENSE](../tencentdb-agent-memory/LICENSE) | MIT |
| [BMAD Method](../bmad-method/README.md) | [LICENSE](../bmad-method/LICENSE) | MIT |
| [Ponytail](../ponytail/README.md) | [LICENSE](../ponytail/LICENSE) | MIT |
| [Mobile MCP](../mobile-mcp/README.md) | [LICENSE](../mobile-mcp/LICENSE) | Apache-2.0 |
| [Chrome DevTools MCP](../chrome-devtools-mcp/README.md) | [LICENSE](../chrome-devtools-mcp/LICENSE) | Apache-2.0 |
| [Open Computer Use](../open-codex-computer-use/README.md) | [LICENSE](../open-codex-computer-use/LICENSE) | MIT |

## Before public distribution

Original root-repository material is licensed under AGPL-3.0-only, with a separate paid commercial option for rights controlled by Moroz Inc.; see [LICENSING.md](../LICENSING.md). Separately licensed components and maintained fork directories retain their own license terms. Preserve all upstream copyright notices and license files. About identifies upstream versions and harness patches, while Git submodule references and the runtime preparers identify exact sources.

Maintained integration commits are published on `feature/ellmsha-v2026.10.9-patch1` in the nine fork repositories; the root gitlinks pin their exact revisions, including AionRS. Fresh recursive checkout verification is recorded in the release status. This is source publication, not a claim that every platform package has been built.

## Local source audit — 2026-10-10

- Root Git exclusions cover `.env`, local `.data`, workspaces, logs and local agent/dependency directories. Docker exclusions additionally cover nested runtime data and build output.
- A bounded scan of 6,668 candidate text files across the root and nine forks checked private-key headers, GitHub token patterns and AWS access-key identifiers. Its one match was a redaction unit-test fixture in AionUI. This is not a comprehensive secret audit or a scan of complete Git history.
- Documentation screenshots come from isolated QA profiles. Review every newly added screenshot before publication; do not use real connected-account views or commercial source content.
- On 2026-10-10 the user authorized source publication. A subsequent scan covered 6,910 candidate files and 391 local-history blobs; key-pattern matches were confirmed test fixtures. Local profiles, `.env`, `.data`, IDE metadata and commercial workspaces are excluded. This bounded check is not a comprehensive audit of upstream history.
