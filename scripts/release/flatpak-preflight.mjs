import { spawnSync } from 'node:child_process';

// Exercise the actual configured SDK sandbox before spending time compiling.
// A version check alone misses disabled user namespaces and missing runtimes.
export function checkFlatpak(config, run = spawnSync) {
  const checks = [
    ['flatpak-builder', ['--version']],
    ...[
      [config.runtime, config.runtimeVersion],
      [config.sdk, config.runtimeVersion],
      [config.base, config.baseVersion],
    ].map(([id, branch]) => {
      if (!id || !branch) throw new Error('Flatpak runtime, SDK and base versions must be configured');
      return ['flatpak', ['info', `${id}//${branch}`]];
    }),
    ['flatpak', ['run', '--command=true', `${config.sdk}//${config.runtimeVersion}`]],
  ];
  for (const [command, args] of checks) {
    const result = run(command, args, { encoding: 'utf8', timeout: 30_000 });
    if (result.error || result.status !== 0) {
      const reason = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
      throw new Error(`Flatpak preflight failed: ${command} ${args.join(' ')}\n${reason}\nSee scripts/release/README.md for native Linux prerequisites.`);
    }
  }
}
