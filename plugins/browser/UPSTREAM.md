# Chrome DevTools MCP upstream

- Original project: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Maintained fork: https://github.com/ShiftHackZ/ellmsha-chrome-devtools-mcp
- Upstream tag: `chrome-devtools-mcp-v0.16.0`
- Upstream commit: `4f7b06898327ab5be42c85bd98bd176f33d55d89`
- Source package version: `0.16.0`
- eLLMsha patch: `1`
- License: Apache-2.0

The root `chrome-devtools-mcp` checkout uses the exact upstream commit above,
with `origin` pointing to the maintained fork and `upstream` pointing to the
original project. eLLMsha builds the bundled runtime from that checkout. The
runtime includes the upstream `LICENSE` and is started directly by Node; it
does not invoke `npx` or use a user npm cache after installation.
