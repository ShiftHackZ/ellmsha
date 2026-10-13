import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Bun writes .exe/.bunx shims on Windows; npm writes .cmd shims. The
// extensionless commands in build-with-builder.js support both through cmd.exe.
export function checkBuildPrerequisites(root, platform = process.platform) {
  for (const required of ['aioncore/Cargo.toml', 'aionrs/Cargo.toml']) {
    if (!existsSync(path.join(root, required))) throw new Error(`Missing prerequisite: ${required}`);
  }
  const bins = {};
  for (const name of ['electron-builder', 'electron-vite']) {
    const packageDirectory = path.join(root, 'aionui/node_modules', name);
    const manifest = path.join(packageDirectory, 'package.json');
    if (!existsSync(manifest)) throw new Error(`Missing prerequisite: aionui/node_modules/${name}/package.json`);
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
    const entry = typeof bin === 'string' ? bin : bin?.[name];
    const executable = typeof entry === 'string' ? path.resolve(packageDirectory, entry) : null;
    if (!executable || !existsSync(executable) || !statSync(executable).isFile()) {
      throw new Error(`Missing prerequisite: ${name} package CLI entry`);
    }
    const shim = path.join(root, 'aionui/node_modules/.bin', name);
    const suffixes = platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
    if (!suffixes.some((suffix) => existsSync(`${shim}${suffix}`) && statSync(`${shim}${suffix}`).isFile())) {
      throw new Error(`Missing prerequisite: ${name} executable shim in aionui/node_modules/.bin`);
    }
    bins[name] = executable;
  }
  return bins;
}
