const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Windows npm is a .cmd shim; execute its JS entry point without a shell.
function runBuildCommand(command, args, options, platform = process.platform, execute = execFileSync) {
  if (command === 'npm' && platform === 'win32') {
    const npmShim = execute('where.exe', ['npm.cmd'], { encoding: 'utf8', env: options?.env })
      .trim().split(/\r?\n/)[0];
    if (!npmShim) throw new Error('Build requires an npm CLI installation');
    const npmCli = path.win32.join(path.win32.dirname(npmShim), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return execute(process.execPath, [npmCli, ...args], options);
  }
  return execute(command, args, options);
}

module.exports = { runBuildCommand };
