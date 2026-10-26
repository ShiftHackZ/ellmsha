import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeEnv } from './runtime-env.mjs';

test('macOS login Keychain keeps the real HOME while CLI data stays separate', () => {
  const env = runtimeEnv({ HOME: '/Users/tester', PATH: '/usr/bin', TMPDIR: '/tmp', GITHUB_TOKEN: 'do-not-forward' }, '/tmp/probe');
  assert.equal(env.HOME, '/Users/tester');
  assert.equal(env.COPILOT_HOME, '/tmp/probe/copilot');
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/probe/config');
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.throws(() => runtimeEnv({}, '/tmp/probe'), /real user HOME/);
});
