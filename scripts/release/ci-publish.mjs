#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_REPOSITORY } from './ci-preflight.mjs';
import { verifyReleaseArtifacts } from './ci-artifacts.mjs';
import { validateManifest } from '../../docker/release-images.mjs';

export function compareReleaseTags(left, right) {
  const parse = (tag) => {
    const match = /^v(\d{4})\.(\d{1,2})\.(\d{1,2})-patch\.([1-9]\d*)$/.exec(tag);
    if (!match) throw new Error('Cannot compare the current latest release version');
    return match.slice(1).map(Number);
  };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export async function publishRelease({ source, directory, notes, run = runGh }) {
  if (!source.publish || source.source.repository !== RELEASE_REPOSITORY) throw new Error('Public release provenance required');
  const builds = await verifyReleaseArtifacts({ directory, source });
  const images = JSON.parse(readFileSync(path.join(directory, 'images.json'), 'utf8'));
  validateManifest(images, true);
  if (images.version !== source.version || images.sourceRevision !== source.source.commit) throw new Error('Image provenance differs from installer source');
  const tag = `v${source.version}`;
  const latest = run(['api', `repos/${RELEASE_REPOSITORY}/releases/latest`], true);
  if (latest && compareReleaseTags(tag, JSON.parse(latest).tag_name) < 0) throw new Error('Refusing to replace latest with an older release');
  const existing = run(['api', `repos/${RELEASE_REPOSITORY}/releases/tags/${tag}`], true);
  const files = [...builds.flatMap((build) => [
    ...build.files.map((file) => file.name), `SHA256SUMS-${build.target}.txt`, `BUILD-METADATA-${build.target}.json`,
  ]), 'images.json'];
  if (existing) {
    const release = JSON.parse(existing);
    if (!release.draft || release.tag_name !== tag || release.target_commitish !== source.source.commit) throw new Error('Refusing to modify a published release or a draft from another source');
    if (release.assets.some((asset) => !files.includes(asset.name))) throw new Error('Existing draft contains unexpected assets; inspect it before retrying');
    run(['release', 'upload', tag, ...files.map((file) => path.join(directory, file)), '--clobber', '--repo', RELEASE_REPOSITORY]);
    run(['release', 'edit', tag, '--notes-file', notes, '--title', `eLLMsha ${source.version}`, '--repo', RELEASE_REPOSITORY]);
  } else {
    run(['release', 'create', tag, ...files.map((file) => path.join(directory, file)), '--verify-tag', '--target', source.source.commit,
      '--draft', '--title', `eLLMsha ${source.version}`, '--notes-file', notes, '--repo', RELEASE_REPOSITORY]);
  }
  run(['release', 'edit', tag, '--draft=false', '--latest', '--repo', RELEASE_REPOSITORY]);
  return `https://github.com/${RELEASE_REPOSITORY}/releases/tag/${tag}`;
}

function runGh(args, missingOkay = false) {
  try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    if (missingOkay && /HTTP 404/.test(String(error.stderr))) return null;
    throw new Error(`GitHub release operation failed (${args[0]}); published assets were not removed`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const source = JSON.parse(readFileSync(process.env.RELEASE_SOURCE_MANIFEST, 'utf8'));
    const url = await publishRelease({ source, directory: process.env.RELEASE_STAGE_DIR, notes: path.resolve('docs/releases', `${source.version}.md`) });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
    console.log(url);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
