import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { imagePlan, validateManifest, forbiddenContextPath, cleanContext, archive } from './release-images.mjs';
test('archive preserves pinned LFS pointer bytes with an active smudge filter', (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'ellmsha-archive-lfs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repository = path.join(dir, 'repository');
  fs.mkdirSync(repository);
  const git = args => execFileSync('git', args, { cwd: repository, env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init']);
  const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64) + '\nsize 11\n';
  fs.writeFileSync(path.join(repository, '.gitattributes'), '*.zip filter=fixture-lfs\n');
  fs.writeFileSync(path.join(repository, 'fixture.zip'), pointer);
  fs.writeFileSync(path.join(repository, 'source.txt'), 'unchanged source\n');
  git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'synthetic archive inputs']);
  const filter = path.join(dir, 'lfs-smudge');
  fs.writeFileSync(filter, '#!/bin/sh\nif [ "$GIT_LFS_SKIP_SMUDGE" = "1" ]; then cat; else cat >/dev/null; printf "materialized"; fi\n', { mode: 0o755 });
  git(['config', 'filter.fixture-lfs.smudge', filter]);
  const before = execFileSync('tar', ['-xOf', '-', 'fixture.zip'], { input: git(['archive', '--format=tar', 'HEAD']), encoding: 'utf8' });
  assert.equal(before, 'materialized', 'ordinary git archive must exercise the active smudge filter');
  const output = path.join(dir, 'archive');
  fs.mkdirSync(output);
  const prior = process.env.GIT_LFS_SKIP_SMUDGE;
  process.env.GIT_LFS_SKIP_SMUDGE = '0';
  try { archive(repository, output); }
  finally { if (prior === undefined) delete process.env.GIT_LFS_SKIP_SMUDGE; else process.env.GIT_LFS_SKIP_SMUDGE = prior; }
  assert.equal(fs.readFileSync(path.join(output, 'fixture.zip'), 'utf8'), pointer);
  assert.equal(fs.readFileSync(path.join(output, 'source.txt'), 'utf8'), 'unchanged source\n');
});
test('release manifest binds four amd64 images to exact source/version, never latest', () => {
  const m = imagePlan('2026.10.13-patch.10', 'a'.repeat(40));
  assert.equal(m.images.length, 4);
  assert.equal(m.platform, 'linux/amd64');
  assert.ok(m.images.every(i => !JSON.stringify(i).includes(':latest')));
  assert.throws(() => imagePlan('latest', 'main'));
  assert.throws(() => validateManifest(m, true));
  m.published = true; m.images.forEach(i => i.digest = 'sha256:' + 'b'.repeat(64));
  validateManifest(m, true);
  m.images[1].image = 'ghcr.io/elsewhere/private';
  assert.throws(() => validateManifest(m, true));
});
test('private/untracked runtime material is barred from archive context', () => {
  for (const p of ['.data/account.json', 'aionui/.env', 'nested/.env.production', 'config/auth.json', 'signing/certificate.p12', 'nested/id.key', '.aws/config', 'workspaces/customer/README.md', 'nested/memory.sqlite', 'aioncore/.opencode/skills/cron', 'aionui/.aionrs/skills/cron', 'nested/.agents/skills/local']) assert.equal(forbiddenContextPath(p), true, p);
  for (const p of ['aioncore/Cargo.lock', 'aionui/bun.lock', 'aionui/scripts/memory/locks/MemoryCore.json', 'docker/memory.Dockerfile']) assert.equal(forbiddenContextPath(p), false, p);
});
test('context removes ambient skill links without dereferencing or modifying foreign files', (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'ellmsha-context-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const context = path.join(dir, 'context');
  fs.mkdirSync(path.join(context, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'foreign-sentinel'), 'unchanged');
  for (const name of ['.opencode', '.aionrs', '.agents']) {
    fs.mkdirSync(path.join(context, name, 'skills'), { recursive: true });
    fs.symlinkSync(path.join(dir, 'missing-developer-home', 'cron'), path.join(context, name, 'skills', 'cron'));
    fs.symlinkSync(path.join(dir, 'foreign-sentinel'), path.join(context, name, 'skills', 'foreign'));
  }
  fs.writeFileSync(path.join(context, 'src', 'build-input'), 'tracked input');
  fs.symlinkSync('src/build-input', path.join(context, 'input-link'));
  fs.symlinkSync('src', path.join(context, 'source-link'));
  assert.equal(cleanContext(context), 3);
  for (const name of ['.opencode', '.aionrs', '.agents']) assert.equal(fs.existsSync(path.join(context, name)), false);
  assert.equal(fs.readFileSync(path.join(dir, 'foreign-sentinel'), 'utf8'), 'unchanged');
  assert.equal(fs.readFileSync(path.join(context, 'input-link'), 'utf8'), 'tracked input');
  assert.equal(fs.readlinkSync(path.join(context, 'source-link')), 'src');
});
test('retained broken, escaping and private-input links fail closed', (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'ellmsha-context-links-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'context-sibling'));
  fs.writeFileSync(path.join(dir, 'context-sibling', 'outside'), 'foreign');
  for (const [name, target, expected] of [
    ['broken', 'missing', /Unresolvable build-context symlink/],
    ['external', '../context-sibling/outside', /External build-context symlink/],
    ['private-alias', '.env', /Unresolvable build-context symlink/],
  ]) {
    const context = path.join(dir, name === 'external' ? 'context' : name);
    fs.mkdirSync(context);
    fs.writeFileSync(path.join(context, '.env'), 'must be removed');
    fs.symlinkSync(target, path.join(context, 'retained-link'));
    assert.throws(() => cleanContext(context), expected);
    assert.equal(fs.existsSync(path.join(context, '.env')), false);
  }
});
test('only pinned OCU public catalog metadata survives the ambient-agent exclusions', (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'ellmsha-public-ocu-catalog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const context = path.join(dir, 'context');
  const agentPath = 'open-codex-computer-use/.agents';
  const catalog = `${agentPath}/plugins/marketplace.json`;
  fs.mkdirSync(path.join(context, agentPath, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(context, catalog), '{"name":"public-pinned-fixture"}\n');
  const privatePaths = [`${agentPath}/plugins/other.json`, `${agentPath}/skills/cron`, 'other-fork/.agents/plugins/marketplace.json'];
  for (const file of privatePaths) {
    assert.equal(forbiddenContextPath(file), true, file);
    fs.mkdirSync(path.dirname(path.join(context, file)), { recursive: true });
    fs.symlinkSync(path.join(dir, 'missing-private-target'), path.join(context, file));
  }
  assert.equal(forbiddenContextPath(catalog), false);
  cleanContext(context);
  assert.equal(fs.readFileSync(path.join(context, catalog), 'utf8'), '{"name":"public-pinned-fixture"}\n');
  for (const file of privatePaths) assert.equal(fs.existsSync(path.join(context, file)), false, file);
  // A path exception never bypasses the retained-link containment check.
  fs.rmSync(path.join(context, catalog));
  fs.writeFileSync(path.join(dir, 'foreign'), 'untouched');
  fs.symlinkSync(path.join(dir, 'foreign'), path.join(context, catalog));
  assert.throws(() => cleanContext(context), /External build-context symlink/);
  assert.equal(fs.readFileSync(path.join(dir, 'foreign'), 'utf8'), 'untouched');
});
test('memory image manifest matches the desktop release locks', () => {
  for (const name of ['MemoryCore', 'MemoryPanel', 'MemoryKnowledge']) {
    const p = JSON.parse(fs.readFileSync(new URL(`../tencentdb-agent-memory/${name}/package.json`, import.meta.url)));
    const lock = JSON.parse(fs.readFileSync(new URL(`../aionui/scripts/memory/locks/${name}.json`, import.meta.url))).packages[''];
    p.dependencies.tsx = '^4.21.0';
    assert.deepEqual(p.dependencies, lock.dependencies, name);
    assert.deepEqual(p.optionalDependencies, lock.optionalDependencies, name);
  }
});

test('partial publish retries reuse matching immutable bytes and repair only missing aliases', async () => {
  const { mkdtempSync, rmSync, writeFileSync, readFileSync } = fs;
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'ellmsha-image-publish-test-'));
  try {
    const manifest = imagePlan('2026.10.13-patch.10', 'a'.repeat(40));
    manifest.images.forEach((item, index) => item.localImageId = `sha256:${String(index).repeat(64)}`);
    const digest = 'sha256:' + 'b'.repeat(64);
    const state = { version: manifest.version, source: manifest.sourceRevision, registry: { [manifest.images[0].versionTag]: digest }, calls: [] };
    const statePath = join(dir, 'state.json');
    const manifestPath = join(dir, 'images.json');
    writeFileSync(statePath, JSON.stringify(state));
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const fakeDocker = join(dir, 'docker');
    writeFileSync(fakeDocker, `#!/usr/bin/env node
const fs=require('fs');const file=process.env.IMAGE_TEST_STATE,s=JSON.parse(fs.readFileSync(file)),a=process.argv.slice(2);s.calls.push(a);let out='',error='';
if(a.slice(0,3).join(' ')==='buildx imagetools inspect'){if(s.registry[a[3]])out=JSON.stringify(s.registry[a[3]]);else error='manifest unknown';}
else if(a[0]==='image'&&a[1]==='inspect')out=JSON.stringify([{Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.revision':s.source,'org.opencontainers.image.version':s.version}}}]);
else if(a[0]==='push')s.registry[a[1]]='sha256:'+'b'.repeat(64);
else if(a.slice(0,3).join(' ')==='buildx imagetools create')s.registry[a[a.indexOf('--tag')+1]]=a.at(-1).split('@')[1];
else if(!['pull','tag'].includes(a[0]))error='Unexpected fake Docker call';
fs.writeFileSync(file,JSON.stringify(s));if(error){console.error(error);process.exit(1)}console.log(out);
`, { mode: 0o755 });
    const execute = () => spawnSync(process.execPath, [new URL('./release-images.mjs', import.meta.url).pathname, 'publish', manifestPath], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, IMAGE_TEST_STATE: statePath }, encoding: 'utf8' });
    const first = execute();
    assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(readFileSync(manifestPath));
    validateManifest(result, true);
    const after = JSON.parse(readFileSync(statePath));
    assert.equal(after.calls.filter(a => a[0] === 'push').length, 3);
    assert.ok(!after.calls.some(a => a[0] === 'push' && a[1] === manifest.images[0].versionTag));
    assert.equal(after.registry[manifest.images[0].shaTag], digest);
    after.calls = [];
    writeFileSync(statePath, JSON.stringify(after));
    assert.equal(execute().status, 0);
    assert.equal(JSON.parse(readFileSync(statePath)).calls.filter(a => ['push', 'tag'].includes(a[0])).length, 0);
    after.registry[manifest.images[0].shaTag] = 'sha256:' + 'c'.repeat(64);
    after.calls = [];
    writeFileSync(statePath, JSON.stringify(after));
    const conflict = execute();
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /Conflicting immutable tags/);
    assert.equal(JSON.parse(readFileSync(statePath)).calls.filter(a => a[0] === 'push').length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('manual promotion refuses an older stable release before any Docker call', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(join(tmpdir(), 'ellmsha-image-promotion-test-'));
  try {
    const m = imagePlan('2026.10.13-patch.10', 'a'.repeat(40));
    m.published = true; m.images.forEach(i => i.digest = 'sha256:' + 'b'.repeat(64));
    fs.writeFileSync(join(dir, 'images.json'), JSON.stringify(m));
    fs.writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='release')console.log(JSON.stringify({isDraft:false,isPrerelease:false,url:'https://github.com/ShiftHackZ/ellmsha/releases/tag/v2026.10.13-patch.10',tagName:'v2026.10.13-patch.10'}));else if(a[1].endsWith('/releases/latest'))console.log('v2026.10.14-patch.11');else throw Error('Unexpected fake GitHub call');
`, { mode: 0o755 });
    fs.writeFileSync(join(dir, 'docker'), `#!/usr/bin/env node
require('fs').writeFileSync(process.env.IMAGE_TEST_DOCKER_CALLED,'called');process.exit(1);
`, { mode: 0o755 });
    const called = join(dir, 'docker-called');
    const result = spawnSync(process.execPath, [new URL('./promote-images.mjs', import.meta.url).pathname, '--manifest', join(dir, 'images.json'), '--release-url', 'https://github.com/ShiftHackZ/ellmsha/releases/tag/v2026.10.13-patch.10'], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, IMAGE_TEST_DOCKER_CALLED: called }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not the current stable release/);
    assert.equal(fs.existsSync(called), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
