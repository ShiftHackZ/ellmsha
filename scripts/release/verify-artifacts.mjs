#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLinuxPackages } from './flatpak-preflight.mjs';

const formats = { darwin: ['mac', 'dmg', 'zip'], win32: ['win', 'exe'], linux: ['linux'] };
async function exists(file) {
  try { await stat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function verifyArtifacts({ directory, version, platform = process.platform, arch = process.arch, linuxPackages = 'all' }) {
  const [os, ...nativeExtensions] = formats[platform] || [];
  if (!os) throw new Error(`Unsupported package host: ${platform}`);
  const extensions = platform === 'linux' ? resolveLinuxPackages(linuxPackages) : nativeExtensions;
  const date = /^(\d{4})\.(\d{2})\.(\d{2})-patch\.([1-9]\d*)$/.exec(version);
  if (!date) throw new Error('Expected an exact date-formatted release version');
  // electron-builder normalizes package metadata with semver.clean(version, true).
  // Keep the public date format while preserving the exact signed installer bytes.
  const nativeVersion = `${Number(date[1])}.${Number(date[2])}.${Number(date[3])}-patch.${date[4]}`;
  const lines = [];
  for (const extension of extensions) {
    const name = `eLLMsha-${version}-${os}-${arch}.${extension}`;
    const artifact = path.join(directory, name);
    const native = path.join(directory, `eLLMsha-${nativeVersion}-${os}-${arch}.${extension}`);
    if (native !== artifact && await exists(native)) {
      if (await exists(artifact)) throw new Error(`Ambiguous installer names; refusing to overwrite: ${name}`);
      await rename(native, artifact);
    }
    const info = await stat(artifact);
    if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty package: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(artifact)) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
    console.log(`Verified package: ${name} (${info.size} bytes)`);
  }
  await writeFile(path.join(directory, `SHA256SUMS-${os}-${arch}.txt`), `${lines.join('\n')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const { version } = JSON.parse(await readFile(path.join(root, 'aionui/package.json'), 'utf8'));
  await verifyArtifacts({ directory: path.join(root, 'aionui/out'), version, linuxPackages: process.env.RELEASE_LINUX_PACKAGES ?? 'all' });
}
