# Open Computer Use upstream

- Original project: https://github.com/iFurySt/open-codex-computer-use
- Maintained fork: https://github.com/ShiftHackZ/ellmsha-open-codex-computer-use
- Upstream version: `0.3.6`
- Upstream commit: `83a521e546102564efd002f61a6763912081e5c7`
- eLLMsha source patch: `0`
- License: MIT

The pinned macOS package declares Swift tools 6.2 and macOS 14. Linux and
Windows use the fork's Go 1.22 modules. Linux runtime actions also require
Python 3, PyGObject, AT-SPI2, and the signed-in desktop D-Bus session; Windows
uses PowerShell, UI Automation, and Win32 window messages in the signed-in
desktop session.

The root `open-codex-computer-use` checkout must use the exact commit above,
with `origin` pointing to the maintained fork and `upstream` pointing to the
original project. eLLMsha builds and runs the native runtime from this checkout;
startup never downloads or resolves a registry package.

The eLLMsha integration adds packaging, runtime pin validation, plugin metadata,
and an adapted built-in skill around the unchanged fork baseline.
