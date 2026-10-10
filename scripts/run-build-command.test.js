const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runBuildCommand } = require('./run-build-command');

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
