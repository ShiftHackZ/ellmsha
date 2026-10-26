import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('Code OSS root dependencies survive the real builder filter; native code remains signed', () => {
  const root = fileURLToPath(new URL('../../aionui/', import.meta.url));
  const require = createRequire(realpathSync(path.join(root, 'node_modules/electron-builder/cli.js')));
  const { FileMatcher } = require('app-builder-lib/out/fileMatcher');
  const config = require('js-yaml').load(readFileSync(path.join(root, 'packages/desktop/electron-builder.yml'), 'utf8'));
  const entry = config.extraResources.find(row => row.to === 'copilot-ide/runtime/node_modules');
  assert.ok(entry, 'root node_modules needs its own mapping');
  const source = path.join(root, entry.from);
  const filter = new FileMatcher(source, '/unused', value => value, entry.filter).createFilter();
  assert.ok(filter(path.join(source, 'minimist'), { isDirectory: () => true }));
  assert.ok(filter(path.join(source, 'minimist/index.js'), { isDirectory: () => false }));
  for (const name of ['Code - OSS', 'app.node', 'lib.dylib', 'eLLMsha.app']) {
    assert.ok(!config.mac.signIgnore.some(pattern => new RegExp(pattern).test(name)), name);
  }
});
