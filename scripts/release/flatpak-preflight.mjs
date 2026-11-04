import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveLinuxPackages(value = 'all') {
  if (value === 'all') return ['flatpak', 'deb'];
  if (value === 'flatpak' || value === 'deb') return [value];
  throw new Error(`Linux package selection must be all, flatpak or deb; got ${JSON.stringify(value)}`);
}

function configuredRefs(config) {
  const refs = [
    [config?.runtime, config?.runtimeVersion],
    [config?.sdk, config?.runtimeVersion],
    [config?.base, config?.baseVersion],
  ];
  if (refs.some(ref => ref.some(value => typeof value !== 'string' || !value.trim()))) {
    throw new Error('Flatpak runtime, SDK and base versions must be configured');
  }
  return refs.map(([id, branch]) => `${id}//${branch}`);
}

function checkedRun(command, args, run, options = {}) {
  const result = run(command, args, { encoding: 'utf8', timeout: 30_000, ...options });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    throw new Error(`Flatpak preflight failed: ${command} ${args.join(' ')}\n${reason}\nSee scripts/release/README.md for native Linux prerequisites.`);
  }
}

// Install into the caller's user installation (FLATPAK_USER_DIR in CI). Update
// restored refs noninteractively before the pinned bundler checks them again.
export function installFlatpak(config, run = spawnSync) {
  const refs = configuredRefs(config);
  checkedRun('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], run, { stdio: 'inherit', timeout: 60_000 });
  checkedRun('flatpak', ['install', '--user', '--noninteractive', '--assumeyes', '--or-update', 'flathub', ...refs], run, { stdio: 'inherit', timeout: 30 * 60_000 });
  checkFlatpak(config, run);
}

// Exercise the actual configured SDK sandbox before spending time compiling.
// A version check alone misses disabled user namespaces and missing runtimes.
export function checkFlatpak(config, run = spawnSync) {
  const checks = [
    ['flatpak-builder', ['--version']],
    ...configuredRefs(config).map(ref => ['flatpak', ['info', ref]]),
    ['flatpak', ['run', '--command=true', `${config.sdk}//${config.runtimeVersion}`]],
  ];
  for (const [command, args] of checks) {
    checkedRun(command, args, run);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'linux') throw new Error('Flatpak preparation requires a native Linux host');
  if (process.argv.slice(2).join(' ') !== '--install') throw new Error('Usage: node scripts/release/flatpak-preflight.mjs --install');
  if (resolveLinuxPackages(process.env.RELEASE_LINUX_PACKAGES).includes('flatpak')) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const require = createRequire(path.join(root, 'aionui/package.json'));
    const config = require('js-yaml').load(readFileSync(path.join(root, 'aionui/packages/desktop/electron-builder.yml'), 'utf8'));
    installFlatpak(config.flatpak);
  }
}
