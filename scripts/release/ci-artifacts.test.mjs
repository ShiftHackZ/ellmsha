import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectArtifacts, stageArtifacts, verifyReleaseArtifacts } from './ci-artifacts.mjs';
import { verifyArtifacts } from './verify-artifacts.mjs';

test('release requires all three platform installers, exact hashes and source provenance', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-ci-artifacts-'));
  const source = { version: '2026.10.13-patch.10', publish: true, source: { commit: 'a'.repeat(40), submodules: [{ path: 'aionui', commit: 'b'.repeat(40) }] } };
  const sourceFile = path.join(temp, 'source.json');
  const output = path.join(temp, 'staged');
  try {
    await writeFile(sourceFile, JSON.stringify(source));
    for (const [target, extensions] of Object.entries({ 'mac-arm64': ['dmg', 'zip'], 'win-x64': ['exe'], 'linux-x64': ['flatpak', 'deb', 'AppImage'] })) {
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
    assert.equal((await verifyReleaseArtifacts({ directory: output, source })).length, 3);
    const linuxChecksumPath = path.join(output, 'SHA256SUMS-linux-x64.txt');
    const linuxChecksum = await readFile(linuxChecksumPath, 'utf8');
    await writeFile(linuxChecksumPath, linuxChecksum.split('\n')[0]);
    await assert.rejects(() => verifyReleaseArtifacts({ directory: output, source }), /incomplete/);
    await writeFile(linuxChecksumPath, linuxChecksum);
    await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'linux-x64', signing: 'developer-id-notarized' }), /Linux artifacts must declare unsigned/);
    await assert.rejects(() => verifyReleaseArtifacts({ directory: output, source: { ...source, source: { ...source.source, commit: 'c'.repeat(40) } } }), /provenance/);
    await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'unsigned' }), /signed and notarized/);
    // Signing is mandatory for verification too, even though nothing is published.
    const verification = { ...source, publish: false, signMacos: true };
    await writeFile(sourceFile, JSON.stringify(verification));
    await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'unsigned' }), /signed and notarized/);
    const signed = await stageArtifacts({ sourceFile, directory: temp, output, target: 'mac-arm64', signing: 'developer-id-notarized' });
    assert.equal(signed.publish, false);
    assert.equal(signed.signMacos, true);
    assert.equal((await verifyReleaseArtifacts({ directory: output, source: verification })).length, 3);
    // Development manifests cannot opt out of the same macOS acceptance policy.
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


for (const [platform, target, extensions] of [['darwin', 'mac-arm64', ['dmg', 'zip']], ['win32', 'win-x64', ['exe']], ['linux', 'linux-x64', ['flatpak', 'deb', 'AppImage']]]) {
  test(`zero-padded release dates preserve ${target} installer bytes and public names`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-date-artifacts-'));
    const version = '2026.01.02-patch.3';
    const data = Buffer.from('synthetic signed installer bytes');
    try {
      for (const extension of extensions) {
        const nativeTarget = platform === 'linux' ? `linux-${{ flatpak: 'x86_64', deb: 'amd64', AppImage: 'x64' }[extension]}` : target;
        await writeFile(path.join(temp, `eLLMsha-2026.1.2-patch.3-${nativeTarget}.${extension}`), data);
      }
      await verifyArtifacts({ directory: temp, version, platform, arch: target.endsWith('arm64') ? 'arm64' : 'x64' });
      for (const extension of extensions) assert.deepEqual(await readFile(path.join(temp, `eLLMsha-${version}-${target}.${extension}`)), data);
      const checksum = await readFile(path.join(temp, `SHA256SUMS-${target}.txt`), 'utf8');
      assert.ok(checksum.includes(createHash('sha256').update(data).digest('hex')));
      assert.ok(checksum.includes(`eLLMsha-${version}-${target}`));
      assert.equal((await inspectArtifacts(temp, version, target)).files.length, extensions.length);
      await verifyArtifacts({ directory: temp, version, platform, arch: target.endsWith('arm64') ? 'arm64' : 'x64' });
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}

test('date normalization never accepts a different patch or overwrites an existing public installer', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-date-reject-'));
  const input = { directory: temp, version: '2026.11.02-patch.1', platform: 'win32', arch: 'x64' };
  try {
    await writeFile(path.join(temp, 'eLLMsha-2026.11.2-patch.2-win-x64.exe'), 'wrong patch');
    await assert.rejects(() => verifyArtifacts(input), /ENOENT/);
    const publicName = path.join(temp, 'eLLMsha-2026.11.02-patch.1-win-x64.exe');
    await writeFile(publicName, 'existing public bytes');
    await writeFile(path.join(temp, 'eLLMsha-2026.11.2-patch.1-win-x64.exe'), 'new native bytes');
    await assert.rejects(() => verifyArtifacts(input), /refusing to overwrite/);
    assert.equal(await readFile(publicName, 'utf8'), 'existing public bytes');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

for (const linuxPackages of ['flatpak', 'deb', 'appimage']) {
  test(`Linux ${linuxPackages}-only verification stages exact selected bytes without requiring other formats`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-linux-artifact-'));
    const source = { version: '2026.11.04-patch.1', publish: false, linuxPackages, source: { commit: 'a'.repeat(40), submodules: [] } };
    const sourceFile = path.join(temp, 'source.json');
    const output = path.join(temp, 'staged');
    const data = Buffer.from(`synthetic ${linuxPackages} bytes`);
    const extension = linuxPackages === 'appimage' ? 'AppImage' : linuxPackages;
    const publicName = `eLLMsha-${source.version}-linux-x64.${extension}`;
    const nativeName = linuxPackages === 'appimage' ? publicName :
      `eLLMsha-2026.11.4-patch.1-linux-${linuxPackages === 'flatpak' ? 'x86_64' : 'amd64'}.${extension}`;
    try {
      await writeFile(sourceFile, JSON.stringify(source));
      await writeFile(path.join(temp, nativeName), data);
      await verifyArtifacts({ directory: temp, version: source.version, platform: 'linux', arch: 'x64', linuxPackages });
      const staged = await stageArtifacts({ sourceFile, directory: temp, output, target: 'linux-x64', signing: 'unsigned' });
      assert.deepEqual(staged.files, [{ name: publicName, size: data.length, sha256: createHash('sha256').update(data).digest('hex') }]);
      assert.equal(staged.linuxPackages, linuxPackages);
      assert.deepEqual(await readFile(path.join(output, publicName)), data);
      // Official publication deliberately uses the complete default allowlist.
      await assert.rejects(() => inspectArtifacts(output, source.version, 'linux-x64'), /incomplete/);
      await assert.rejects(() => stageArtifacts({ sourceFile, directory: temp, output, target: 'linux-x64', signing: 'unsigned', linuxPackages: 'all' }), /selection differs/);
      await assert.rejects(() => verifyArtifacts({ directory: temp, version: source.version, platform: 'linux', arch: 'x64', linuxPackages: 'AppImage' }), /Linux package selection/);
      const sums = await readFile(path.join(temp, 'SHA256SUMS-linux-x64.txt'), 'utf8');
      await writeFile(path.join(temp, 'SHA256SUMS-linux-x64.txt'), `${sums}${sums}`);
      await assert.rejects(() => inspectArtifacts(temp, source.version, 'linux-x64', linuxPackages), /duplicate/);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}

test('Linux architecture normalization works without date padding and never overwrites public bytes', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ellmsha-linux-arch-'));
  const version = '2026.11.13-patch.1';
  try {
    for (const [arch, extension, nativeArch] of [['x64', 'flatpak', 'x86_64'], ['x64', 'deb', 'amd64'], ['arm64', 'flatpak', 'aarch64']]) {
      const nativeName = path.join(temp, `eLLMsha-${version}-linux-${nativeArch}.${extension}`);
      const publicName = path.join(temp, `eLLMsha-${version}-linux-${arch}.${extension}`);
      const input = { directory: temp, version, platform: 'linux', arch, linuxPackages: extension };
      await writeFile(nativeName, 'original package bytes');
      await verifyArtifacts(input);
      assert.equal(await readFile(publicName, 'utf8'), 'original package bytes');
      await writeFile(nativeName, 'different package bytes');
      await assert.rejects(() => verifyArtifacts(input), /refusing to overwrite/);
      assert.equal(await readFile(publicName, 'utf8'), 'original package bytes');
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
