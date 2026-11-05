import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFlatpak, installFlatpak, resolveLinuxPackages } from './flatpak-preflight.mjs';

const config = { runtime: 'org.freedesktop.Platform', sdk: 'org.freedesktop.Sdk', runtimeVersion: '26.08', base: 'org.electronjs.Electron2.BaseApp', baseVersion: '26.08' };

test('Linux package selection is explicit and rejects unsupported formats', () => {
  assert.deepEqual(resolveLinuxPackages(), ['flatpak', 'deb', 'AppImage']);
  assert.deepEqual(resolveLinuxPackages('all'), ['flatpak', 'deb', 'AppImage']);
  assert.deepEqual(resolveLinuxPackages('flatpak'), ['flatpak']);
  assert.deepEqual(resolveLinuxPackages('deb'), ['deb']);
  for (const value of ['', 'rpm', 'deb,deb', '--publish=always', null]) {
    assert.throws(() => resolveLinuxPackages(value), /Linux package selection/);
  }
});

test('native Linux build plans forward only the selected package formats', () => {
  for (const selection of ['all', 'flatpak', 'deb', 'appimage', 'deb,appimage', 'flatpak,appimage']) {
    // Planning does not execute a build or sandbox; model the native Linux host
    // so this contract also runs in macOS and Windows release preflight.
    const script = new URL('./build.mjs', import.meta.url);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(script))}, '--plan', '--unsigned'];
      await import(${JSON.stringify(script.href)});
    `], { encoding: 'utf8', env: { ...process.env, RELEASE_LINUX_PACKAGES: selection } });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.target, 'linux-x64');
    assert.equal(plan.publish, false);
    const targets = resolveLinuxPackages(selection);
    const host = targets.filter(value => value !== 'AppImage');
    const metadata = !targets.includes('deb') ? [] : ['--config.extraMetadata.homepage=https://github.com/ShiftHackZ/ellmsha'];
    assert.deepEqual(plan.steps[1][1], ['scripts/build-with-builder.js', 'x64', '--linux', ...(host.length ? host : ['dir']), '--x64', ...metadata]);
    assert.equal(plan.steps.length, targets.includes('AppImage') ? 3 : 2);
    if (targets.includes('AppImage')) assert.deepEqual(plan.steps[2], ['bash', ['scripts/release/package-appimage.sh', 'x64'], '.']);
  }
});

test('DEB-only setup does not invoke Flatpak or load its dependencies', () => {
  const script = new URL('./flatpak-preflight.mjs', import.meta.url);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(script))}, '--install'];
    await import(${JSON.stringify(script.href)});
  `], { encoding: 'utf8', env: { ...process.env, PATH: '', RELEASE_LINUX_PACKAGES: 'deb' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('CI setup updates cached configured refs noninteractively and verifies their sandbox', () => {
  const calls = [];
  installFlatpak(config, (command, args, options) => { calls.push([command, args, options]); return { status: 0 }; });
  assert.deepEqual(calls[0].slice(0, 2), ['flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo']]);
  assert.deepEqual(calls[1].slice(0, 2), ['flatpak', ['install', '--user', '--noninteractive', '--assumeyes', '--or-update', 'flathub', 'org.freedesktop.Platform//26.08', 'org.freedesktop.Sdk//26.08', 'org.electronjs.Electron2.BaseApp//26.08']]);
  assert.deepEqual(calls.at(-1).slice(0, 2), ['flatpak', ['run', '--command=true', 'org.freedesktop.Sdk//26.08']]);
  assert.equal(calls.length, 7);
  assert.throws(() => installFlatpak(config, () => ({ status: 1, stderr: 'remote download failed' })), /remote download failed/);
  assert.throws(() => installFlatpak({ ...config, sdk: '' }, () => assert.fail('must validate before execution')), /must be configured/);
});

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
