import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { imagePlan, validateManifest, forbiddenContextPath } from './release-images.mjs';
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
  for (const p of ['.data/account.json', 'aionui/.env', 'nested/.env.production', 'config/auth.json', 'signing/certificate.p12', 'nested/id.key', '.aws/config', 'workspaces/customer/README.md', 'nested/memory.sqlite']) assert.equal(forbiddenContextPath(p), true, p);
  for (const p of ['aioncore/Cargo.lock', 'aionui/bun.lock', 'aionui/scripts/memory/locks/MemoryCore.json', 'docker/memory.Dockerfile']) assert.equal(forbiddenContextPath(p), false, p);
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
