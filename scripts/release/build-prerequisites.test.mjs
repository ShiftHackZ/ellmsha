import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBuildPrerequisites } from './build-prerequisites.mjs';

function fixture(t, shimSuffix) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ellmsha-build-prerequisites-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (relative, content = '') => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  for (const name of ['aioncore', 'aionrs']) write(`${name}/Cargo.toml`);
  for (const name of ['electron-builder', 'electron-vite']) {
    write(`aionui/node_modules/${name}/package.json`, JSON.stringify({ bin: { [name]: 'cli.js' } }));
    write(`aionui/node_modules/${name}/cli.js`, 'process.exit(0);');
    write(`aionui/node_modules/.bin/${name}${shimSuffix}`);
  }
  return { root, write };
}

test('Bun Windows executable shims do not require npm .cmd files', (t) => {
  const { root, write } = fixture(t, '.exe');
  for (const name of ['electron-builder', 'electron-vite']) write(`aionui/node_modules/.bin/${name}.bunx`);
  const bins = checkBuildPrerequisites(root, 'win32');
  assert.equal(bins['electron-builder'], path.join(root, 'aionui/node_modules/electron-builder/cli.js'));
  assert.equal(bins['electron-vite'], path.join(root, 'aionui/node_modules/electron-vite/cli.js'));
});

test('npm Windows and Unix extensionless shims remain supported', (t) => {
  assert.doesNotThrow(() => checkBuildPrerequisites(fixture(t, '.cmd').root, 'win32'));
  assert.doesNotThrow(() => checkBuildPrerequisites(fixture(t, '').root, 'darwin'));
});

test('a shim cannot hide a missing package CLI', (t) => {
  const { root } = fixture(t, '.exe');
  rmSync(path.join(root, 'aionui/node_modules/electron-builder/cli.js'));
  assert.throws(() => checkBuildPrerequisites(root, 'win32'), /electron-builder package CLI entry/);
});

test('direct JS execution does not require package-manager executable shims', (t) => {
  const { root } = fixture(t, '.bunx');
  rmSync(path.join(root, 'aionui/node_modules/.bin'), { recursive: true });
  assert.doesNotThrow(() => checkBuildPrerequisites(root));
});
