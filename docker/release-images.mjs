import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const services = ['web', 'memory-core', 'memory-hub', 'memory-proxy'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
export function validateIdentity(version, revision) {
  if (!/^\d{4}\.\d{2}\.\d{2}-patch\.\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(revision)) throw Error('Expected release version and exact 40-character source SHA');
}
export function imagePlan(version, revision) {
  validateIdentity(version, revision);
  return { format: 1, version, sourceRevision: revision, platform: 'linux/amd64', published: false,
    images: services.map(service => { const image = `ghcr.io/shifthackz/ellmsha-${service}`; return { service, image, versionTag: `${image}:${version}`, shaTag: `${image}:sha-${revision}`, digest: null }; }) };
}
export function validateManifest(manifest, published = false) {
  const expected = imagePlan(manifest.version, manifest.sourceRevision);
  if (manifest.format !== 1 || manifest.platform !== expected.platform || manifest.images?.length !== services.length) throw Error('Invalid image manifest');
  for (const item of expected.images) {
    const actual = manifest.images.find(candidate => candidate.service === item.service);
    if (!actual || ['image', 'versionTag', 'shaTag'].some(key => actual[key] !== item[key])) throw Error('Unexpected image identity');
    if (published && !/^sha256:[a-f0-9]{64}$/.test(actual.digest)) throw Error('Missing published image digest');
  }
  if (published && manifest.published !== true) throw Error('Images were not published');
}
export function forbiddenContextPath(file) {
  // Public OCU catalog metadata is part of its exact source pin. No sibling
  // agent configuration or skill is included by these directory exceptions.
  if (['open-codex-computer-use/.agents', 'open-codex-computer-use/.agents/plugins', 'open-codex-computer-use/.agents/plugins/marketplace.json'].includes(file)) return false;
  return /(^|\/)(?:\.git|\.data|\.aws|\.codex|\.claude|\.opencode|\.aionrs|\.agents|node_modules|workspaces)(\/|$)/.test(file)
    || /(^|\/)(?:\.env(?:\..*)?|\.npmrc|auth\.json|credentials\.json)$/.test(file)
    || /\.(?:p12|pfx|key|pem|mobileprovision|provisionprofile|sqlite3?|db)$/i.test(file);
}
export function cleanContext(destination) {
  destination = fs.realpathSync(destination);
  let removed = 0;
  const links = [];
  function clean(folder, relative = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(folder, entry.name);
      if (forbiddenContextPath(file)) { fs.rmSync(absolute, { recursive: true, force: true }); removed++; }
      else if (entry.isSymbolicLink()) links.push({ file, absolute });
      else if (entry.isDirectory()) clean(absolute, file);
    }
  }
  clean(destination);
  // Validate after all exclusions: an alias must not retain removed private inputs.
  for (const { file, absolute } of links) {
    let target;
    try { target = fs.realpathSync(absolute); }
    catch (cause) { throw Error(`Unresolvable build-context symlink: ${file}`, { cause }); }
    if (!target.startsWith(destination + path.sep)) throw Error(`External build-context symlink: ${file}`);
  }
  return removed;
}
function archive(repository, destination) {
  const result = spawnSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: repository, maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw Error('Could not archive source');
  const unpack = spawnSync('tar', ['-xf', '-', '-C', destination], { input: result.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
  if (unpack.status !== 0) throw Error('Could not prepare build context');
}
export function prepareContext(destination, version, revision) {
  validateIdentity(version, revision);
  destination = path.resolve(destination);
  if (destination === root || destination.startsWith(root + path.sep) || fs.existsSync(destination)) throw Error('Context must be a new directory outside the checkout');
  if (run('git', ['rev-parse', 'HEAD']) !== revision || run('git', ['status', '--porcelain', '--untracked-files=all'])) throw Error('Release checkout must be clean and match source_ref');
  const submodules = run('git', ['submodule', 'status', '--recursive']).split('\n').filter(Boolean);
  // Nested submodules are checked as well; a missing or unpinned source cannot ship.
  if (submodules.some(line => /^[+U-]/.test(line))) throw Error('Submodule revision mismatch');
  fs.mkdirSync(destination, { recursive: true });
  archive(root, destination);
  const pins = {};
  for (const line of submodules) {
    const [sha, folder] = line.trim().split(/\s+/);
    if (!folder || path.isAbsolute(folder) || folder.split('/').includes('..')) throw Error('Invalid submodule path');
    const source = path.join(root, folder);
    if (run('git', ['status', '--porcelain', '--untracked-files=all'], source)) throw Error(`Dirty submodule: ${folder}`);
    const target = path.join(destination, folder);
    fs.mkdirSync(target, { recursive: true });
    archive(source, target);
    pins[folder] = sha;
  }
  // Archive only tracked public inputs, then remove files forbidden even in a tracked tree.
  const removed = cleanContext(destination);
  fs.writeFileSync(path.join(destination, 'docker/source.json'), JSON.stringify({ version, revision, submodules: pins }, null, 2) + '\n');
  console.log(`Prepared tracked source context; ${removed} forbidden paths excluded`);
}
function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'prepare-context') return prepareContext(...args);
  if (command === 'manifest') {
    const [file, version, revision] = args;
    const manifest = imagePlan(version, revision);
    for (const image of manifest.images) {
      const local = `ellmsha-release-${image.service}:candidate`;
      const info = JSON.parse(run('docker', ['image', 'inspect', local]))[0];
      if (info.Os !== 'linux' || info.Architecture !== 'amd64' || info.Config.Labels?.['org.opencontainers.image.revision'] !== revision || info.Config.Labels?.['org.opencontainers.image.version'] !== version) throw Error(`Image identity mismatch: ${image.service}`);
      image.localImageId = info.Id;
    }
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    return;
  }
  if (command === 'validate') {
    const [file, version, revision, published] = args;
    const manifest = JSON.parse(fs.readFileSync(file));
    validateManifest(manifest, published === 'published');
    if (manifest.version !== version || manifest.sourceRevision !== revision) throw Error('Parent release identity mismatch');
    return;
  }
  if (command === 'publish') {
    const [file] = args;
    const manifest = JSON.parse(fs.readFileSync(file));
    validateManifest(manifest);
    const inspect = tag => {
      const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', tag, '--format', '{{json .Manifest.Digest}}'], { encoding: 'utf8' });
      if (result.status === 0) {
        const digest = JSON.parse(result.stdout);
        if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw Error(`Invalid registry digest: ${tag}`);
        return digest;
      }
      if (!/(manifest unknown|not found|404)/i.test(result.stderr)) throw Error(`Could not establish tag absence: ${tag}`);
      return null;
    };
    // Validate all existing tags before publishing anything. A partial retry reuses
    // matching already-built bytes; it never replaces a tag with a fresh rebuild.
    const existing = manifest.images.map(item => {
      const versionDigest = inspect(item.versionTag), shaDigest = inspect(item.shaTag);
      if (versionDigest && shaDigest && versionDigest !== shaDigest) throw Error(`Conflicting immutable tags: ${item.service}`);
      const digest = versionDigest || shaDigest;
      if (digest) {
        const reference = `${item.image}@${digest}`;
        run('docker', ['pull', reference]);
        const info = JSON.parse(run('docker', ['image', 'inspect', reference]))[0];
        if (info.Os !== 'linux' || info.Architecture !== 'amd64' || info.Config.Labels?.['org.opencontainers.image.revision'] !== manifest.sourceRevision || info.Config.Labels?.['org.opencontainers.image.version'] !== manifest.version) throw Error(`Existing tag provenance mismatch: ${item.service}`);
      }
      return { versionDigest, shaDigest, digest };
    });
    for (const [index, item] of manifest.images.entries()) {
      const prior = existing[index];
      if (!prior.digest) {
        run('docker', ['tag', item.localImageId, item.versionTag]);
        run('docker', ['push', item.versionTag]);
        prior.digest = inspect(item.versionTag);
        prior.versionDigest = prior.digest;
      }
      for (const [tag, present] of [[item.versionTag, prior.versionDigest], [item.shaTag, prior.shaDigest]]) {
        if (!present) run('docker', ['buildx', 'imagetools', 'create', '--prefer-index=false', '--tag', tag, `${item.image}@${prior.digest}`]);
        if (inspect(tag) !== prior.digest) throw Error(`Registry tag changed during publication: ${tag}`);
      }
      item.digest = prior.digest;
      delete item.localImageId;
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    }
    manifest.published = true;
    validateManifest(manifest, true);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    return;
  }
  throw Error('Usage: release-images.mjs prepare-context DIR VERSION SHA | manifest FILE VERSION SHA | publish FILE');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
