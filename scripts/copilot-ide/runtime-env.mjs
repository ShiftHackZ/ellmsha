import { join } from 'node:path';

export function runtimeEnv(parent, state) {
  if (!parent.HOME) throw new Error('The real user HOME is required for macOS Keychain');
  return {
    PATH: parent.PATH,
    HOME: parent.HOME,
    TMPDIR: parent.TMPDIR,
    // Official per-component profile overrides preserve Keychain discovery.
    COPILOT_HOME: join(state, 'copilot'),
    XDG_CONFIG_HOME: join(state, 'config'),
    NODE_ENV: 'development',
    VSCODE_DEV: '1',
  };
}
