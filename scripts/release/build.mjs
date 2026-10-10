#!/usr/bin/env node
// Build only on the target OS/architecture; never download an upstream backend.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFlatpak } from './flatpak-preflight.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!['--plan', '--signed'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
}
const targets = { darwin: ['--mac', 'dmg', 'zip'], win32: ['--win', 'nsis'], linux: ['--linux', 'flatpak', 'deb'] };
if (!targets[process.platform] || !['arm64', 'x64'].includes(process.arch)) {
  throw new Error(`Unsupported native target: ${process.platform}-${process.arch}`);
}
const backend = path.join(root, 'aioncore/target/release', process.platform === 'win32' ? 'aioncore.exe' : 'aioncore');
const env = {
  ...process.env,
  CARGO_HOME: process.env.ELLM_SHA_CARGO_HOME || path.join(root, '.data/cargo'),
  AIONUI_BACKEND_BIN: backend,
  AIONUI_BACKEND_LOCAL_BINARY: backend,
  AIONUI_BACKEND_LOCAL_BUNDLE_DIR: '',
  AIONUI_BACKEND_RUN_ID: '',
  AIONUI_HUB_TAG: 'f9570c40796cc23365970a645c0841b8d2cc7c15',
  // Retain the existing explicit --publish=never in build-with-builder.js.
  CSC_IDENTITY_AUTO_DISCOVERY: args.has('--signed') ? 'true' : 'false',
};
// rust-lang/rust#157750: stripped proc-macro dylibs cannot load on macOS 27.
if (process.platform === 'darwin') env.CARGO_PROFILE_RELEASE_STRIP = 'none';
if (!args.has('--signed')) {
  for (const key of ['CSC_LINK', 'CSC_NAME', 'WIN_CSC_LINK', 'WIN_CSC_NAME', 'APPLE_ID', 'APPLE_API_KEY', 'APPLE_KEYCHAIN', 'appleId', 'appleIdPassword', 'teamId']) delete env[key];
}
const steps = [
  ['cargo', ['build', '--locked', '--release', '-p', 'aionui-app', '--bin', 'aioncore'], 'aioncore'],
  [process.execPath, ['scripts/build-with-builder.js', process.arch, ...targets[process.platform], `--${process.arch}`], 'aionui'],
];
if (args.has('--plan')) {
  console.log(JSON.stringify({ target: `${process.platform}-${process.arch}`, signed: args.has('--signed'), publish: false, steps }, null, 2));
} else {
  for (const required of ['aioncore/Cargo.toml', 'aionrs/Cargo.toml', `aionui/node_modules/.bin/electron-builder${process.platform === 'win32' ? '.cmd' : ''}`]) {
    if (!existsSync(path.join(root, required))) throw new Error(`Missing prerequisite: ${required}`);
  }
  if (process.platform === 'linux') {
    const require = createRequire(path.join(root, 'aionui/package.json'));
    const config = require('js-yaml').load(readFileSync(path.join(root, 'aionui/packages/desktop/electron-builder.yml'), 'utf8'));
    checkFlatpak(config.flatpak);
  }
  for (const [command, commandArgs, directory] of steps) {
    const result = spawnSync(command, commandArgs, { cwd: path.join(root, directory), env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
