import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, readlink, access, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('staging preserves bundle-relative symlinks and excludes profiles', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'copilot-stage-'));
  const source = join(fixture, 'source'), destination = join(fixture, 'staged');
  try {
    for (const name of ['.build/electron/Framework/Versions/A', 'out', 'node_modules', 'extensions', 'src', 'user-data']) await mkdir(join(source, name), { recursive: true });
    await symlink('A', join(source, '.build/electron/Framework/Versions/Current'));
    await writeFile(join(source, 'product.json'), JSON.stringify({ nameShort: 'Code - OSS', applicationName: 'code-oss' }));
    await writeFile(join(source, 'package.json'), JSON.stringify({ version: '1.144.0' }));
    for (const name of ['src/main.ts', 'out/main.js', 'LICENSE.txt', 'ThirdPartyNotices.txt']) await writeFile(join(source, name), 'ELLMSHA_IDE_BACKGROUND');
    await writeFile(join(source, 'user-data/fixture-marker'), 'not a distributable');
    await promisify(execFile)(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'stage-runtime.mjs'), '--source', source, '--destination', destination]);
    assert.equal(await readlink(join(destination, '.build/electron/Framework/Versions/Current')), 'A');
    await assert.rejects(access(join(destination, 'user-data')), { code: 'ENOENT' });
    assert.equal(JSON.parse(await readFile(join(destination, 'ellmsha-runtime.json'), 'utf8')).sourceCommit, null);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
