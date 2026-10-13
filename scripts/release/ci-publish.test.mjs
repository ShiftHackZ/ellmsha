import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compareReleaseTags, publishRelease } from './ci-publish.mjs';
import { stageArtifacts } from './ci-artifacts.mjs';
import { imagePlan } from '../../docker/release-images.mjs';

test('publication resumes only an exact-source draft and never overwrites a published release', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-ci-publish-'));
  const source = { version: '2026.10.13-patch.10', publish: true, source: { repository: 'ShiftHackZ/ellmsha', commit: 'a'.repeat(40), submodules: [] } };
  const sourceFile = path.join(temp, 'source.json'), directory = path.join(temp, 'staged');
  try {
    await writeFile(sourceFile, JSON.stringify(source));
    for (const [target, extensions] of Object.entries({ 'mac-arm64': ['dmg', 'zip'], 'win-x64': ['exe'] })) {
      const sums = [];
      for (const extension of extensions) {
        const name = `eLLMsha-${source.version}-${target}.${extension}`, content = `fixture ${name}`;
        await writeFile(path.join(temp, name), content);
        sums.push(`${createHash('sha256').update(content).digest('hex')}  ${name}`);
      }
      await writeFile(path.join(temp, `SHA256SUMS-${target}.txt`), `${sums.join('\n')}\n`);
      await stageArtifacts({ sourceFile, directory: temp, output: directory, target, signing: target === 'mac-arm64' ? 'developer-id-notarized' : 'unsigned' });
    }
    const images = imagePlan(source.version, source.source.commit);
    images.published = true;
    for (const item of images.images) item.digest = `sha256:${'b'.repeat(64)}`;
    await writeFile(path.join(directory, 'images.json'), JSON.stringify(images));
    await writeFile(path.join(directory, 'unrelated-private-file'), 'must never upload');
    let existing = null;
    let latest = null;
    const calls = [];
    const run = (args) => { calls.push(args); return args[0] === 'api' ? args[1].endsWith('/latest') ? latest && JSON.stringify(latest) : existing && JSON.stringify(existing) : ''; };
    const opts = { source, directory, notes: path.join(temp, 'notes.md'), run };
    assert.match(await publishRelease(opts), /v2026\.10\.13-patch\.10$/);
    assert.ok(calls[2].includes('--draft'));
    assert.ok(calls[2].includes(source.source.commit));
    assert.ok(!calls.flat().some((value) => value.includes('unrelated-private-file')));
    existing = { draft: true, tag_name: `v${source.version}`, target_commitish: source.source.commit, assets: [] };
    calls.length = 0;
    await publishRelease(opts);
    assert.equal(calls[2][1], 'upload');
    assert.ok(calls[2].includes('--clobber'));
    assert.equal(calls.at(-1)[3], '--draft=false');
    for (const invalid of [{ ...existing, draft: false }, { ...existing, target_commitish: 'c'.repeat(40) }, { ...existing, assets: [{ name: 'foreign.txt' }] }]) {
      existing = invalid; calls.length = 0;
      await assert.rejects(() => publishRelease(opts), /Refusing|unexpected assets/);
      assert.equal(calls.length, 2);
    }
    latest = { tag_name: 'v2026.10.14-patch.1' }; calls.length = 0;
    await assert.rejects(() => publishRelease(opts), /older release/);
    assert.equal(calls.length, 1);
    images.sourceRevision = 'c'.repeat(40);
    await writeFile(path.join(directory, 'images.json'), JSON.stringify(images));
    calls.length = 0;
    await assert.rejects(() => publishRelease(opts), /image identity|provenance/);
    assert.equal(calls.length, 0);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('latest comparison uses numeric calendar and patch fields, including historical unpadded dates', () => {
  assert.equal(compareReleaseTags('v2026.10.13-patch.10', 'v2026.10.13-patch.9'), 1);
  assert.equal(compareReleaseTags('v2026.10.09-patch.2', 'v2026.10.9-patch.2'), 0);
  assert.equal(compareReleaseTags('v2026.10.13-patch.10', 'v2026.10.14-patch.1'), -1);
  assert.throws(() => compareReleaseTags('v2026.10.13-patch.10', 'foreign'), /Cannot compare/);
});
