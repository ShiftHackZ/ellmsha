import assert from 'node:assert/strict';
import test from 'node:test';
import { checkFlatpak } from './flatpak-preflight.mjs';

const config = { runtime: 'org.freedesktop.Platform', sdk: 'org.freedesktop.Sdk', runtimeVersion: '26.08', base: 'org.electronjs.Electron2.BaseApp', baseVersion: '26.08' };

test('checks configured refs and actually launches the SDK sandbox', () => {
  const calls = [];
  checkFlatpak(config, (command, args) => { calls.push([command, args]); return { status: 0 }; });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[2], ['flatpak', ['info', 'org.freedesktop.Sdk//26.08']]);
  assert.deepEqual(calls[4], ['flatpak', ['run', '--command=true', 'org.freedesktop.Sdk//26.08']]);
});

test('stops on missing tools, runtimes or namespace denial with the actual diagnostic', () => {
  for (const failure of [0, 2, 4]) {
    let calls = 0;
    assert.throws(() => checkFlatpak(config, () => {
      return calls++ === failure ? { status: 1, stderr: 'namespace permission denied' } : { status: 0 };
    }), /Flatpak preflight failed:[\s\S]*namespace permission denied/);
    assert.equal(calls, failure + 1);
  }
  assert.throws(() => checkFlatpak(config, () => ({ error: new Error('spawn ENOENT') })), /spawn ENOENT/);
});
