import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSource, desktopMatrix, MAC_SIGNING_SECRETS, parseSubmodules, releaseDate, resolveReleaseMode, validateRelease } from './ci-preflight.mjs';

const input = { version: '2026.10.13-patch.10', branding: { version: '2026.10.13', patch: 10 }, event: 'push', ref: 'refs/tags/v2026.10.13-patch.10', repository: 'ShiftHackZ/ellmsha', publish: true, now: new Date('2026-10-13T12:00:00Z') };
test('official exact tag and About metadata pass; publication uses Kyiv date', () => {
  assert.equal(validateRelease(input).tag, 'v2026.10.13-patch.10');
  assert.equal(releaseDate(new Date('2026-10-13T22:01:00Z')), '2026.10.14');
  assert.throws(() => validateRelease({ ...input, now: new Date('2026-10-13T22:01:00Z') }), /publication date/);
  assert.throws(() => validateRelease({ ...input, branding: { version: '2026.10.13', patch: 9 } }), /metadata/);
  assert.throws(() => validateRelease({ ...input, ref: 'refs/heads/main' }), /exact tag/);
  assert.throws(() => validateRelease({ ...input, repository: 'someone/fork' }), /official/);
});
test('manual verification accepts candidate dates but never PR events', () => {
  assert.equal(validateRelease({ ...input, event: 'workflow_dispatch', ref: 'refs/heads/main', publish: false, now: new Date('2026-11-02T12:00:00Z') }).publish, false);
  for (const event of ['pull_request', 'pull_request_target', 'workflow_run']) assert.throws(() => validateRelease({ ...input, event, publish: false }), /only tag push/);
  for (const version of ['2026.02.30-patch.1', '2026.13.01-patch.1', '2026.10.13-patch.0', '2026.10.13-patch.1;echo x']) assert.throws(() => validateRelease({ ...input, version }));
});
test('manual publication can seed main caches but rejects other branch refs', () => {
  assert.equal(validateRelease({ ...input, event: 'workflow_dispatch', ref: 'refs/heads/main' }).publish, true);
  assert.throws(() => validateRelease({ ...input, event: 'workflow_dispatch', ref: 'refs/heads/feature/other' }), /exact tag/);
});
const allPlatforms = (publish) => ({ publish, signMacos: true, macos: true, windows: true, linux: true, docker: true, desktop: true, linuxPackages: 'all' });
test('all platforms default on; selected macOS stays signed and only publication requires tag/date', () => {
  assert.deepEqual(resolveReleaseMode({ GITHUB_EVENT_NAME: 'workflow_dispatch' }), allPlatforms(false));
  for (const event of ['workflow_dispatch', 'push']) {
    for (const publish of [false, true]) {
      const mode = resolveReleaseMode({ GITHUB_EVENT_NAME: event, RELEASE_PUBLISH: String(publish) });
      assert.deepEqual(mode, allPlatforms(event === 'push' || publish));
    }
  }
  const mode = resolveReleaseMode({ GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_PUBLISH: 'false' });
  assert.equal(validateRelease({ ...input, ...mode, event: 'workflow_dispatch', ref: 'refs/heads/main', now: new Date('2026-11-02T12:00:00Z') }).publish, false);
});
test('desktop preflight fails early without all six secrets, including non-publishing runs', () => {
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_PUBLISH: 'false', REQUIRE_SIGNING_SECRETS: 'true' };
  assert.throws(() => resolveReleaseMode(env), (error) => MAC_SIGNING_SECRETS.every((name) => error.message.includes(name)));
  assert.deepEqual(resolveReleaseMode({ ...env, MAC_SIGNING_READY: 'true' }), allPlatforms(false));
  assert.throws(() => resolveReleaseMode({ ...env, RELEASE_SIGN_MACOS: 'false' }), /requires Developer ID/);
  assert.throws(() => resolveReleaseMode({ ...env, RELEASE_PUBLISH: 'true' }), /requires Developer ID/);
  assert.throws(() => resolveReleaseMode({ ...env, GITHUB_EVENT_NAME: 'push' }), /requires Developer ID/);
  assert.throws(() => resolveReleaseMode({ ...env, MAC_SIGNING_READY: 'false' }), /requires Developer ID/);
  assert.throws(() => resolveReleaseMode({ ...env, GITHUB_EVENT_NAME: 'pull_request', MAC_SIGNING_READY: 'true' }), /only tag push/);
});
test('all sixteen platform combinations select exact jobs; publication requires the complete set', () => {
  for (const macos of [false, true]) for (const windows of [false, true]) for (const linux of [false, true]) for (const docker of [false, true]) for (const publish of [false, true]) {
    const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_PUBLISH: String(publish), RELEASE_BUILD_MACOS: String(macos), RELEASE_BUILD_WINDOWS: String(windows), RELEASE_BUILD_LINUX: String(linux), RELEASE_BUILD_DOCKER: String(docker), REQUIRE_SIGNING_SECRETS: 'true', MAC_SIGNING_READY: String(macos) };
    if (!macos && !windows && !linux && !docker) assert.throws(() => resolveReleaseMode(env), /at least one build/);
    else if (publish && (!macos || !windows || !linux || !docker)) assert.throws(() => resolveReleaseMode(env), /all four platforms/);
    else {
      const mode = resolveReleaseMode(env);
      assert.deepEqual(mode, { publish, signMacos: macos, macos, windows, linux, docker, desktop: macos || windows || linux, linuxPackages: 'all' });
      assert.deepEqual(desktopMatrix(mode).include.map(({ target }) => target), [macos && 'mac-arm64', windows && 'win-x64', linux && 'linux-x64'].filter(Boolean));
    }
  }
  assert.deepEqual(resolveReleaseMode({ GITHUB_EVENT_NAME: 'push', RELEASE_BUILD_MACOS: 'false', RELEASE_BUILD_WINDOWS: 'false', RELEASE_BUILD_LINUX: 'false', RELEASE_BUILD_DOCKER: 'false', RELEASE_LINUX_PACKAGES: 'flatpak', RELEASE_PUBLISH: 'false' }), allPlatforms(true));
  for (const key of ['RELEASE_BUILD_MACOS', 'RELEASE_BUILD_WINDOWS', 'RELEASE_BUILD_LINUX', 'RELEASE_BUILD_DOCKER']) assert.throws(() => resolveReleaseMode({ GITHUB_EVENT_NAME: 'workflow_dispatch', [key]: 'invalid' }), /true or false/);
});
test('Flatpak-only manual testing needs no Apple credentials and cannot publish partial packages', () => {
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_BUILD_MACOS: 'false', RELEASE_BUILD_WINDOWS: 'false', RELEASE_BUILD_LINUX: 'true', RELEASE_BUILD_DOCKER: 'false', RELEASE_LINUX_PACKAGES: 'flatpak', REQUIRE_SIGNING_SECRETS: 'true' };
  const mode = resolveReleaseMode(env);
  assert.equal(mode.linuxPackages, 'flatpak');
  assert.equal(mode.signMacos, false);
  assert.deepEqual(desktopMatrix(mode), { include: [{ os: 'ubuntu-24.04', target: 'linux-x64', signing: 'unsigned', environment: 'ci' }] });
  assert.throws(() => resolveReleaseMode({ ...env, RELEASE_PUBLISH: 'true' }), /all four platforms/);
  assert.throws(() => resolveReleaseMode({ GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_PUBLISH: 'true', RELEASE_LINUX_PACKAGES: 'flatpak' }), /all Linux packages/);
  assert.throws(() => resolveReleaseMode({ ...env, RELEASE_LINUX_PACKAGES: 'appimage' }), /Linux package/);
});
test('source provenance rejects missing, moved, conflicted or modified gitlinks', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(parseSubmodules(` ${sha} aionui (heads/main)\n ${sha} aioncore`), [{ path: 'aionui', commit: sha }, { path: 'aioncore', commit: sha }]);
  for (const prefix of ['-', '+', 'U']) assert.throws(() => parseSubmodules(`${prefix}${sha} aionui`), /exact committed/);
  const git = (args) => args[0] === 'rev-parse' ? sha : args[0] === 'submodule' ? ` ${sha} aionui` : '';
  assert.equal(collectSource('/fixture', git).commit, sha);
  assert.throws(() => collectSource('/fixture', (args) => args[0] === 'status' ? ' M source.ts' : git(args)), /tracked changes/);
  assert.throws(() => collectSource('/fixture', (args) => args[0] === 'submodule' ? '' : git(args)), /missing/);
});
