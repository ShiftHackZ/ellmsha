#!/usr/bin/env node
// CI only. Credentials are never written to the checkout or included in artifacts.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAC_SIGNING_SECRETS } from './ci-preflight.mjs';

export function signingConfig(env) {
  const missing = MAC_SIGNING_SECRETS.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing signing secrets: ${missing.join(', ')}`);
  if (!/^Developer ID Application: [^\r\n\0]+$/.test(env.MAC_SIGNING_IDENTITY)) throw new Error('Public CI requires Developer ID Application, never Apple Development or ad-hoc signing');
  if (!/^[A-Z0-9]{10}$/.test(env.MAC_TEAM_ID)) throw new Error('Invalid signing team ID');
  return { identity: env.MAC_SIGNING_IDENTITY, teamIdentifier: env.MAC_TEAM_ID, type: 'distribution', notaryProfile: 'ellmsha-ci' };
}

export function setupSigning({ env = process.env, run = runSecret, token = randomBytes(24).toString('hex') } = {}) {
  const config = signingConfig(env);
  if (env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP || !env.GITHUB_ENV) throw new Error('Signing setup requires an isolated GitHub Actions runner');
  const directory = path.join(env.RUNNER_TEMP, 'ellmsha-signing');
  const keychain = path.join(directory, 'signing.keychain-db');
  const certificate = path.join(directory, 'certificate.p12');
  const configPath = path.join(directory, 'config.json');
  if (existsSync(directory)) throw new Error('Signing workspace already exists; cleanup before retrying');
  mkdirSync(directory, { mode: 0o700 });
  // Remember only public paths, so cleanup can restore the original search list.
  const original = run('security', ['list-keychains', '-d', 'user']).split(/\r?\n/).map((line) => line.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  writeFileSync(path.join(directory, 'keychains.json'), JSON.stringify(original), { mode: 0o600 });
  const bytes = Buffer.from(env.MAC_CERTIFICATE_P12_BASE64, 'base64');
  if (!bytes.length) throw new Error('Certificate secret is empty');
  writeFileSync(certificate, bytes, { mode: 0o600 });
  try {
    run('security', ['create-keychain', '-p', token, keychain]);
    run('security', ['set-keychain-settings', '-lut', '21600', keychain]);
    run('security', ['unlock-keychain', '-p', token, keychain]);
    run('security', ['import', certificate, '-P', env.MAC_CERTIFICATE_PASSWORD, '-A', '-t', 'cert', '-f', 'pkcs12', '-k', keychain]);
    run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', token, keychain]);
    run('security', ['list-keychains', '-d', 'user', '-s', keychain, ...original]);
    run('xcrun', ['notarytool', 'store-credentials', config.notaryProfile, '--keychain', keychain,
      '--apple-id', env.MAC_NOTARY_APPLE_ID, '--team-id', config.teamIdentifier, '--password', env.MAC_NOTARY_APP_PASSWORD]);
    writeFileSync(configPath, `${JSON.stringify(config)}\n`, { mode: 0o600 });
    appendFileSync(env.GITHUB_ENV, `ELLM_SHA_MAC_SIGNING_CONFIG=${configPath}\nAPPLE_KEYCHAIN=${keychain}\n`);
    return { directory, keychain, configPath };
  } finally {
    rmSync(certificate, { force: true });
  }
}

export function cleanupSigning({ env = process.env, run = runSecret } = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP) throw new Error('Signing cleanup requires an isolated GitHub Actions runner');
  const directory = path.join(env.RUNNER_TEMP, 'ellmsha-signing');
  if (!existsSync(directory)) return;
  let failure;
  const attempt = (fn) => { try { fn(); } catch (error) { failure ??= error; } };
  const keychain = path.join(directory, 'signing.keychain-db');
  if (existsSync(keychain)) attempt(() => run('security', ['delete-keychain', keychain]));
  const prior = path.join(directory, 'keychains.json');
  if (existsSync(prior)) attempt(() => run('security', ['list-keychains', '-d', 'user', '-s', ...JSON.parse(readFileSync(prior, 'utf8'))]));
  rmSync(directory, { recursive: true, force: true });
  if (failure) throw failure;
}

function runSecret(command, args) {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  // execFile errors include argv (which contain credentials); never print them.
  catch { throw new Error(`${command} signing operation failed; no credentials were logged`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'darwin') throw new Error('macOS signing requires a native macOS runner');
    if (process.argv[2] === 'setup') setupSigning();
    else if (process.argv[2] === 'cleanup') cleanupSigning();
    else throw new Error('Use setup or cleanup');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
