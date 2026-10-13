const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');

function resolveLocalPackageBin(directory, name) {
  const packageDirectory = path.join(directory, 'node_modules', name);
  const manifest = path.join(packageDirectory, 'package.json');
  if (!existsSync(manifest)) throw new Error(`Missing prerequisite: ${name} local package`);
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const entry = typeof bin === 'string' ? bin : bin?.[name];
  const executable = typeof entry === 'string' ? path.resolve(packageDirectory, entry) : null;
  if (!executable || !existsSync(executable) || !statSync(executable).isFile()) {
    throw new Error(`Missing prerequisite: ${name} package CLI entry`);
  }
  return executable;
}

// Run the installed JS entry directly: no npm download or OS-specific shim/shell.
function runLocalPackageBin(directory, name, args, options = {}) {
  return execFileSync(process.execPath, [resolveLocalPackageBin(directory, name), ...args], {
    ...options,
    cwd: directory,
    shell: false,
  });
}

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

module.exports = { runBuildCommand, resolveLocalPackageBin, runLocalPackageBin };
