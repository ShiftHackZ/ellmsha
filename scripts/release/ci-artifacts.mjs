#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const formats = { 'mac-arm64': ['dmg', 'zip'], 'win-x64': ['exe'] };
export async function inspectArtifacts(directory, version, target) {
  if (!formats[target] || !/^\d{4}\.\d{2}\.\d{2}-patch\.[1-9]\d*$/.test(version)) throw new Error('Unsupported release version or target');
  const checksumName = `SHA256SUMS-${target}.txt`;
  const checksumText = await readFile(path.join(directory, checksumName), 'utf8');
  const expected = formats[target].map((extension) => `eLLMsha-${version}-${target}.${extension}`);
  const checksums = new Map();
  for (const line of checksumText.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || !expected.includes(match[2]) || checksums.has(match[2])) throw new Error('Checksum manifest contains unexpected or duplicate files');
    checksums.set(match[2], match[1]);
  }
  if (checksums.size !== expected.length) throw new Error('Checksum manifest is incomplete');
  const files = [];
  for (const name of expected) {
    const file = path.join(directory, name);
    const info = await stat(file);
    if (!info.isFile() || !info.size) throw new Error(`Missing or empty installer: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    if (sha256 !== checksums.get(name)) throw new Error(`Installer checksum mismatch: ${name}`);
    files.push({ name, size: info.size, sha256 });
  }
  return { checksumName, files };
}

export async function stageArtifacts({ sourceFile, directory, output, target, signing }) {
  const source = JSON.parse(await readFile(sourceFile, 'utf8'));
  if (!['unsigned', 'authenticode', 'developer-id-notarized'].includes(signing)) throw new Error('Unknown signing disposition');
  if (source.publish && target === 'mac-arm64' && signing !== 'developer-id-notarized') throw new Error('Public macOS artifact must be signed and notarized');
  const { checksumName, files } = await inspectArtifacts(directory, source.version, target);
  await mkdir(output, { recursive: true });
  for (const name of [...files.map((item) => item.name), checksumName]) await copyFile(path.join(directory, name), path.join(output, name));
  const manifest = { ...source, target, signing, files };
  await writeFile(path.join(output, `BUILD-METADATA-${target}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyReleaseArtifacts({ directory, source }) {
  const builds = [];
  for (const target of Object.keys(formats)) {
    const metadata = JSON.parse(await readFile(path.join(directory, `BUILD-METADATA-${target}.json`), 'utf8'));
    const actual = await inspectArtifacts(directory, source.version, target);
    if (metadata.version !== source.version || metadata.source.commit !== source.source.commit || metadata.target !== target || JSON.stringify(metadata.source.submodules) !== JSON.stringify(source.source.submodules)) throw new Error('Installer source provenance differs from release checkout');
    if (JSON.stringify(metadata.files) !== JSON.stringify(actual.files)) throw new Error('Installer build metadata differs from actual bytes');
    if (source.publish && target === 'mac-arm64' && metadata.signing !== 'developer-id-notarized') throw new Error('Refusing unsigned macOS publication');
    builds.push(metadata);
  }
  return builds;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const env = process.env;
    if (process.argv[2] === 'stage') await stageArtifacts({ sourceFile: env.RELEASE_SOURCE_MANIFEST, directory: path.resolve('aionui/out'), output: env.RELEASE_STAGE_DIR, target: env.RELEASE_TARGET, signing: env.RELEASE_SIGNING });
    else if (process.argv[2] === 'verify') await verifyReleaseArtifacts({ directory: env.RELEASE_STAGE_DIR, source: JSON.parse(await readFile(env.RELEASE_SOURCE_MANIFEST, 'utf8')) });
    else throw new Error('Use stage or verify');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
