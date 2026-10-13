import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectArtifacts, stageArtifacts, verifyReleaseArtifacts } from './ci-artifacts.mjs';

test('release requires both platform installers, exact hashes and source provenance', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-ci-artifacts-'));
  const source = { version: '2026.10.13-patch.10', publish: true, source: { commit: 'a'.repeat(40), submodules: [{ path: 'aionui', commit: 'b'.repeat(40) }] } };
  const sourceFile = path.join(temp, 'source.json');
  const output = path.join(temp, 'staged');
  try {
    await writeFile(sourceFile, JSON.stringify(source));
    for (const [target, extensions] of Object.entries({ 'mac-arm64': ['dmg', 'zip'], 'win-x64': ['exe'] })) {
      const entries = [];
      for (const extension of extensions) {
        const name = `eLLMsha-${source.version}-${target}.${extension}`;
        const data = Buffer.from(`synthetic ${name}`);
        await writeFile(path.join(temp, name), data);
        entries.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
      }
      await writeFile(path.join(temp, `SHA256SUMS-${target}.txt`), `${entries.join('\n')}\n`);
      await stageArtifacts({ sourceFile, directory: temp, output, target, signing: target === 'mac-arm64' ? 'developer-id-notarized' : 'unsigned' });
    }
    assert.equal((await verifyReleaseArtifacts({ directory: output, source })).length, 2);
    await assert.rejects(() => verifyReleaseArtifacts({ directory: output, source: { ...source, source: { ...source.source, commit: 'c'.repeat(40) } } }), /provenance/);
    await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'unsigned' }), /signed and notarized/);
    // Signing is mandatory for verification too, even though nothing is published.
    const verification = { ...source, publish: false, signMacos: true };
    await writeFile(sourceFile, JSON.stringify(verification));
    await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'unsigned' }), /signed and notarized/);
    const signed = await stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'developer-id-notarized' });
    assert.equal(signed.publish, false);
    assert.equal(signed.signMacos, true);
    assert.equal((await verifyReleaseArtifacts({ directory: output, source: verification })).length, 2);
    // Old/malformed provenance cannot opt out of the fixed macOS signing contract.
    const unsigned = { ...verification, signMacos: false };
    await writeFile(sourceFile, JSON.stringify(unsigned));
    await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'unsigned' }), /signed and notarized/);
    await writeFile(path.join(output, 'BUILD-METADATA-mac-arm64.json'), JSON.stringify({ ...signed, signing: 'unsigned' }));
    await assert.rejects(() => verifyReleaseArtifacts({ directory: output, source: verification }), /Refusing unsigned macOS/);
    await assert.rejects(() => verifyReleaseArtifacts({ directory: output, source: unsigned }), /Refusing unsigned macOS/);
    const name = `eLLMsha-${source.version}-win-x64.exe`;
    await writeFile(path.join(output, name), 'tampered');
    await assert.rejects(() => inspectArtifacts(output, source.version, 'win-x64'), /checksum mismatch/);
    const checksum = await readFile(path.join(temp, 'SHA256SUMS-mac-arm64.txt'), 'utf8');
    await writeFile(path.join(temp, 'SHA256SUMS-mac-arm64.txt'), checksum.split('\n')[0]);
    await assert.rejects(() => inspectArtifacts(temp, source.version, 'mac-arm64'), /incomplete/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
