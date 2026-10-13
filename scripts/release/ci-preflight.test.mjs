import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSource, parseSubmodules, releaseDate, validateRelease } from './ci-preflight.mjs';

const input = { version: '2026.10.13-patch.10', branding: { version: '2026.10.13', patch: 10 }, event: 'push', ref: 'refs/tags/v2026.10.13-patch.10', repository: 'ShiftHackZ/ellmsha', publish: true, now: new Date('2026-10-13T12:00:00Z') };
test('official exact tag and About metadata pass; publication uses Kyiv date', () => {
  assert.equal(validateRelease(input).tag, 'v2026.10.13-patch.10');
  assert.equal(releaseDate(new Date('2026-10-13T22:01:00Z')), '2026.10.14');
  assert.throws(() => validateRelease({ ...input, now: new Date('2026-10-13T22:01:00Z') }), /publication date/);
  assert.throws(() => validateRelease({ ...input, branding: { version: '2026.10.13', patch: 9 } }), /metadata/);
  assert.throws(() => validateRelease({ ...input, ref: 'refs/heads/main' }), /exact tag/);
  assert.throws(() => validateRelease({ ...input, repository: 'someone/fork' }), /official/);
});
test('manual unsigned verification accepts candidate dates but never PR events', () => {
  assert.equal(validateRelease({ ...input, event: 'workflow_dispatch', ref: 'refs/heads/main', publish: false, now: new Date('2026-11-02T12:00:00Z') }).publish, false);
  for (const event of ['pull_request', 'pull_request_target', 'workflow_run']) assert.throws(() => validateRelease({ ...input, event, publish: false }), /only tag push/);
  for (const version of ['2026.02.30-patch.1', '2026.13.01-patch.1', '2026.10.13-patch.0', '2026.10.13-patch.1;echo x']) assert.throws(() => validateRelease({ ...input, version }));
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
