import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveLocalPackageBin } from '../run-build-command.js';

// Check the same local JS entries used by build-with-builder.js on every OS.
export function checkBuildPrerequisites(root) {
  for (const required of ['aioncore/Cargo.toml', 'aionrs/Cargo.toml']) {
    if (!existsSync(path.join(root, required))) throw new Error(`Missing prerequisite: ${required}`);
  }
  const bins = {};
  for (const name of ['electron-builder', 'electron-vite']) {
    bins[name] = resolveLocalPackageBin(path.join(root, 'aionui'), name);
  }
  return bins;
}
