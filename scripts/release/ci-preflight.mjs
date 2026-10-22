#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_REPOSITORY = 'ShiftHackZ/ellmsha';
export const MAC_SIGNING_SECRETS = [
  'MAC_CERTIFICATE_P12_BASE64', 'MAC_CERTIFICATE_PASSWORD', 'MAC_SIGNING_IDENTITY',
  'MAC_TEAM_ID', 'MAC_NOTARY_APPLE_ID', 'MAC_NOTARY_APP_PASSWORD',
];

export function resolveReleaseMode(env) {
  if (!['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) throw new Error('Release workflow accepts only tag push or manual dispatch');
  const publish = env.GITHUB_EVENT_NAME === 'push' || env.RELEASE_PUBLISH === 'true';
  const selected = (value) => {
    if (value !== undefined && !['true', 'false'].includes(value)) throw new Error('Build selection must be true or false');
    return value !== 'false';
  };
  const desktop = env.GITHUB_EVENT_NAME === 'push' || selected(env.RELEASE_BUILD_DESKTOP);
  const docker = env.GITHUB_EVENT_NAME === 'push' || selected(env.RELEASE_BUILD_DOCKER);
  if (!desktop && !docker) throw new Error('Select at least one build: desktop or docker');
  if (publish && (!desktop || !docker)) throw new Error('Publication requires both desktop and docker builds from this run');
  if (desktop && env.REQUIRE_SIGNING_SECRETS === 'true' && env.MAC_SIGNING_READY !== 'true') {
    throw new Error(`Signed macOS verification/publication requires Developer ID/notarization secrets: ${MAC_SIGNING_SECRETS.join(', ')}`);
  }
  return { publish, signMacos: true, desktop, docker };
}

export function releaseDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).replaceAll('-', '.');
}

export function validateRelease({ version, branding, event, ref, repository, publish, now = new Date() }) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})-patch\.([1-9]\d*)$/.exec(version ?? '');
  if (!match || new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`).toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) {
    throw new Error('Release version must be a valid YYYY.MM.DD-patch.N');
  }
  const date = `${match[1]}.${match[2]}.${match[3]}`;
  if (branding.version !== date || branding.patch !== Number(match[4])) throw new Error('Package version and About release metadata disagree');
  if (!['push', 'workflow_dispatch'].includes(event)) throw new Error('Release workflow accepts only tag push or manual dispatch');
  const tag = `v${version}`;
  // A manual release from main writes reusable default-branch caches. main()
  // still requires the exact release tag to resolve to the checked-out commit.
  const mainRelease = event === 'workflow_dispatch' && ref === 'refs/heads/main';
  if ((event === 'push' || publish) && !mainRelease) {
    if (ref !== `refs/tags/${tag}`) throw new Error(`Release must run from the exact tag ${tag}`);
  }
  if (publish) {
    if (repository !== RELEASE_REPOSITORY) throw new Error('Only the official root repository may publish');
    if (date !== releaseDate(now)) throw new Error('Release version date must equal publication date in Europe/Kyiv; bump before tagging');
  }
  return { version, tag, date, publish };
}

export function parseSubmodules(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^ ([a-f0-9]{40}) ([A-Za-z0-9_./-]+)(?: \(.*\))?$/.exec(line);
    if (!match || match[2].split('/').includes('..')) throw new Error('Submodules must be initialized at the exact committed gitlinks');
    return { path: match[2], commit: match[1] };
  });
}

export function collectSource(root, runGit = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()) {
  const commit = runGit(['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected an exact root commit');
  const submodules = parseSubmodules(runGit(['submodule', 'status', '--recursive']));
  if (!submodules.length) throw new Error('Release checkout is missing its source submodules');
  for (const directory of [root, ...submodules.map((item) => path.join(root, item.path))]) {
    if (runGit(['status', '--porcelain', '--untracked-files=no'], directory)) throw new Error('Release source has tracked changes');
  }
  return { repository: RELEASE_REPOSITORY, commit, submodules };
}

export function main(env = process.env) {
  const { publish, signMacos, desktop, docker } = resolveReleaseMode(env);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const version = JSON.parse(readFileSync(path.join(root, 'aionui/package.json'), 'utf8')).version;
  const branding = JSON.parse(readFileSync(path.join(root, 'aionui/packages/desktop/src/common/branding/release.json'), 'utf8'));
  const release = validateRelease({ version, branding, event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY, publish });
  const source = { ...collectSource(root), repository: env.GITHUB_REPOSITORY };
  if (env.RELEASE_SOURCE_REF && source.commit !== env.RELEASE_SOURCE_REF) throw new Error('Build checkout differs from the preflight source commit');
  if (publish) {
    const tagCommit = execFileSync('git', ['rev-parse', `${release.tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
    if (tagCommit !== source.commit) throw new Error('Release tag does not point at this source commit');
    readFileSync(path.join(root, 'docs/releases', `${version}.md`));
  }
  const manifest = { schema: 1, ...release, signMacos, desktop, docker, source, checkedAt: new Date().toISOString() };
  if (env.RELEASE_SOURCE_MANIFEST) writeFileSync(env.RELEASE_SOURCE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `version=${version}\ntag=${release.tag}\nsource_ref=${source.commit}\npublish=${publish}\ndesktop=${desktop}\ndocker=${docker}\n`);
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
