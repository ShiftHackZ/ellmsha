#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { version } = JSON.parse(await readFile(path.join(root, 'aionui/package.json'), 'utf8'));
const formats = { darwin: ['mac', 'dmg', 'zip'], win32: ['win', 'exe'], linux: ['linux', 'flatpak', 'deb'] };
const [os, ...extensions] = formats[process.platform] || [];
if (!os) throw new Error(`Unsupported package host: ${process.platform}`);
const lines = [];
for (const extension of extensions) {
  const name = `eLLMsha-${version}-${os}-${process.arch}.${extension}`;
  const artifact = path.join(root, 'aionui/out', name);
  const info = await stat(artifact);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty package: ${name}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${name}`);
  console.log(`Verified package: ${name} (${info.size} bytes)`);
}
await writeFile(path.join(root, 'aionui/out', `SHA256SUMS-${os}-${process.arch}.txt`), `${lines.join('\n')}\n`);
