// Explicit post-release action. Never called by the image build workflow.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateManifest } from './release-images.mjs';
const [manifestFlag, file, flag, releaseUrl] = process.argv.slice(2);
if (manifestFlag !== '--manifest' || flag !== '--release-url') throw Error('Usage: promote-images.mjs --manifest images.json --release-url URL');
const manifest = JSON.parse(fs.readFileSync(file));
validateManifest(manifest, true);
const tag = `v${manifest.version}`;
if (releaseUrl !== `https://github.com/ShiftHackZ/ellmsha/releases/tag/${tag}`) throw Error('Release URL mismatch');
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const release = JSON.parse(run('gh', ['release', 'view', tag, '--repo', 'ShiftHackZ/ellmsha', '--json', 'isDraft,isPrerelease,url,tagName']));
if (release.isDraft || release.isPrerelease || release.url !== releaseUrl || release.tagName !== tag) throw Error('Published stable release not confirmed');
const latestTag = run('gh', ['api', 'repos/ShiftHackZ/ellmsha/releases/latest', '--jq', '.tag_name']);
if (latestTag !== tag) throw Error('Refusing to move latest backwards: this is not the current stable release');
const revision = run('gh', ['api', `repos/ShiftHackZ/ellmsha/commits/${tag}`, '--jq', '.sha']);
if (revision !== manifest.sourceRevision) throw Error('Release source revision mismatch');
for (const item of manifest.images) {
  execFileSync('docker', ['buildx', 'imagetools', 'create', '--prefer-index=false', '--tag', `${item.image}:latest`, `${item.image}@${item.digest}`], { stdio: 'inherit' });
}
