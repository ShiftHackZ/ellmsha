# Mobile Next upstream

- Original project: https://github.com/mobile-next/mobile-mcp
- Maintained fork: https://github.com/ShiftHackZ/ellmsha-mobile-mcp
- Upstream tag: `1.0.8`
- Upstream commit: `65953016441e1f519d47c98d7bcc742647249c95`
- Source package metadata at that tag: `0.0.1`
- eLLMsha patch: `1`
- Published package baseline: `@mobilenext/mobile-mcp@1.0.8`
- Published package integrity: `sha512-LlUaUK/DcI+4oFoKNiM59hAtbmJWGnJFh4eICEeKa7+IKp1uj69ab3HlqdFMrAR5HxU5aMOE2tP1g91fYoPeZQ==`
- Bundled skill source: https://github.com/mobile-next/mobile-mcp/tree/1.0.8/skills/mobile-automation
- License: Apache-2.0

The root `mobile-mcp` checkout must use the exact upstream commit above, with
`origin` pointing to the maintained fork and `upstream` pointing to the
original project. eLLMsha builds the runtime from that checkout and never
resolves the original npm package at startup.

The bundled `mobile-automation` skill retains the upstream workflow and adds an
eLLMsha section for deterministic device selection, actionable local-tooling
errors, project-bound inheritance, and device-data boundaries.
