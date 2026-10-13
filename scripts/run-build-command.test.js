const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { runBuildCommand, resolveLocalPackageBin, runLocalPackageBin } = require('./run-build-command');

test('Windows npm uses Node, preserves arguments and never invokes a shell', () => {
  const calls = [];
  const options = { cwd: 'C:\\workspace with spaces', env: { PATH: 'fixture' }, stdio: 'inherit' };
  const args = ['run', 'build', '--', 'literal & value'];
  const result = runBuildCommand('npm', args, options, 'win32', (...call) => {
    calls.push(call);
    return calls.length === 1 ? 'C:\\Program Files\\nodejs\\npm.cmd\r\nC:\\other\\npm.cmd\r\n' : 'done';
  });
  assert.equal(result, 'done');
  assert.deepEqual(calls[0], ['where.exe', ['npm.cmd'], { encoding: 'utf8', env: options.env }]);
  assert.deepEqual(calls[1], [process.execPath, ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', ...args], options]);
  assert.equal(calls[1][2].shell, undefined);
});

test('native executables and Unix npm keep their existing invocation', () => {
  for (const [command, platform] of [['git', 'win32'], ['npm', 'darwin'], ['npm', 'linux']]) {
    let call;
    runBuildCommand(command, ['--version'], { encoding: 'utf8' }, platform, (...args) => { call = args; });
    assert.deepEqual(call, [command, ['--version'], { encoding: 'utf8' }]);
  }
});

test('missing Windows npm fails before starting a build', () => {
  assert.throws(() => runBuildCommand('npm', ['ci'], {}, 'win32', () => ''), /npm CLI/);
});

test('local npm and Bun package CLIs preserve spaced paths and literal arguments without shims', (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'ellmsha package cli & '));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const layout of ['npm', 'bun']) {
    const directory = path.join(temp, layout);
    const localPackage = path.join(directory, 'node_modules/fixture-cli');
    const packageDirectory = layout === 'bun' ? path.join(directory, 'node_modules/.bun/fixture-cli/node_modules/fixture-cli') : localPackage;
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({ bin: { 'fixture-cli': 'cli.cjs' } }));
    writeFileSync(path.join(packageDirectory, 'cli.cjs'), 'console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));');
    if (layout === 'bun') symlinkSync(packageDirectory, localPackage, 'junction');
    const args = ['--prepackaged', 'C:\\App Folder\\eLLMsha.app', '--config.nsis.include=literal & value', '$(not-a-command)'];
    const result = JSON.parse(runLocalPackageBin(directory, 'fixture-cli', args, { encoding: 'utf8', shell: true }));
    assert.deepEqual(result.args, args);
    assert.equal(realpathSync(result.cwd), realpathSync(directory));
  }
});

test('a missing checkout-local package never falls back to a parent installation', (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'ellmsha-local-cli-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const parentPackage = path.join(temp, 'node_modules/fixture-cli');
  mkdirSync(parentPackage, { recursive: true });
  writeFileSync(path.join(parentPackage, 'package.json'), JSON.stringify({ bin: 'cli.cjs' }));
  writeFileSync(path.join(parentPackage, 'cli.cjs'), 'throw Error("must not execute");');
  assert.throws(() => resolveLocalPackageBin(path.join(temp, 'child'), 'fixture-cli'), /fixture-cli local package/);
});

test('only signed macOS builder children preload the installed dependency file-open queue', { skip: process.platform !== 'darwin' }, (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ellmsha signed builder & '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ['electron-builder', 'electron-vite', 'fs-extra', 'graceful-fs']) {
    const entry = path.join(directory, 'node_modules', name);
    mkdirSync(entry, { recursive: true });
    writeFileSync(path.join(entry, 'package.json'), JSON.stringify({ main: 'index.cjs', bin: 'index.cjs' }));
  }
  writeFileSync(path.join(directory, 'node_modules/fs-extra/index.cjs'), 'module.exports = {};');
  writeFileSync(path.join(directory, 'node_modules/graceful-fs/index.cjs'), `
    const fs = require('node:fs');
    const original = fs.open;
    exports.open = function (...args) { return original(...args); };
    exports.open.queuedFixture = true;
  `);
  const cli = `
    const fs = require('node:fs');
    fs.open('missing-fixture-file', 'r', (error) => console.log(JSON.stringify({
      queued: Boolean(fs.open.queuedFixture), error: error.code, args: process.argv.slice(2)
    })));
  `;
  for (const name of ['electron-builder', 'electron-vite']) writeFileSync(path.join(directory, 'node_modules', name, 'index.cjs'), cli);
  for (const [name, signed, args] of [
    ['electron-builder', '1', ['--mac', 'dmg', 'zip']],
    ['electron-builder', '1', ['--prepackaged', 'literal & App Folder/eLLMsha.app', '--mac', 'dmg', 'zip']],
    ['electron-builder', '0', ['--mac', 'dmg', 'zip']],
    ['electron-vite', '1', ['build']],
  ]) {
    const output = runLocalPackageBin(directory, name, args, { encoding: 'utf8', env: { ...process.env, ELLM_SHA_SIGNING_REQUIRED: signed } });
    const result = JSON.parse(output.trim().split('\n').at(-1));
    assert.deepEqual(result, { queued: name === 'electron-builder' && signed === '1', error: 'ENOENT', args });
  }
});
