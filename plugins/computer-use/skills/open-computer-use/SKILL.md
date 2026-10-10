---
name: open-computer-use
description: Inspect and operate desktop apps through the built-in Open Computer Use MCP server on macOS, Linux, or Windows. Use for desktop UI automation, app-state inspection, and native permission or session troubleshooting.
---

# Open Computer Use

Open Computer Use exposes `list_apps`, `get_app_state`, `click`,
`perform_secondary_action`, `scroll`, `drag`, `type_text`, `press_key`, and
`set_value` from the local, pinned native runtime.

## Operating workflow

1. Call `list_apps`, then call `get_app_state` for the chosen app before acting.
2. Prefer an `element_index` from the latest state over screen coordinates.
3. Refresh state after navigation or any large UI change. Never reuse indexes
   from another app, session, or stale snapshot.
4. Prefer semantic actions and `set_value` for editable controls. Use pointer
   coordinates only when the accessibility tree has no usable target.
5. Treat the desktop as the user's real session. Inspect only the app and data
   needed for the requested task.
6. Obtain user confirmation before sending, deleting, purchasing, approving,
   uploading, or performing another externally visible action unless the user
   already authorized that exact action.

## Platform requirements

- macOS requires version 14 or later plus Accessibility and Screen Recording
  grants for **Open Computer Use.app**. A human must approve those system
  prompts. Run `node scripts/prepare-open-computer-use.js --doctor` from the
  eLLMsha repository to inspect or request the grants; never change TCC data or
  bypass macOS security controls.
- Linux requires `python3`, PyGObject (`gi`), AT-SPI2, and access to the signed-in
  desktop D-Bus session. Coordinate input under Wayland depends on compositor
  support and may be unavailable.
- Windows requires PowerShell and a signed-in interactive desktop. UI Automation
  is preferred; background-safe actions do not intentionally steal focus.

When startup reports a missing runtime, rebuild eLLMsha from the pinned
`open-codex-computer-use` checkout. Do not install or launch an unpinned package
as a fallback.
