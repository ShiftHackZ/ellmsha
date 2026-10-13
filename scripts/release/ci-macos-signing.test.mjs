import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupSigning, setupSigning, signingConfig } from './ci-macos-signing.mjs';

const secrets = { MAC_CERTIFICATE_P12_BASE64: Buffer.from('synthetic certificate').toString('base64'), MAC_CERTIFICATE_PASSWORD: 'fixture-p12', MAC_SIGNING_IDENTITY: 'Developer ID Application: Fixture (ABCDEFGHIJ)', MAC_TEAM_ID: 'ABCDEFGHIJ', MAC_NOTARY_APPLE_ID: 'fixture@example.invalid', MAC_NOTARY_APP_PASSWORD: 'fixture-notary' };
test('public signing cannot silently use local development or missing credentials', () => {
  assert.equal(signingConfig(secrets).type, 'distribution');
  assert.throws(() => signingConfig({}), /Missing signing secrets/);
  assert.throws(() => signingConfig({ ...secrets, MAC_SIGNING_IDENTITY: 'Apple Development: Fixture' }), /Developer ID/);
  assert.throws(() => signingConfig({ ...secrets, MAC_TEAM_ID: 'bad\nID' }), /team ID/);
});
test('ephemeral keychain uses private files, restores original keychains and does not export secrets', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'ellmsha-ci-signing-'));
  const env = { ...secrets, GITHUB_ACTIONS: 'true', RUNNER_TEMP: temp, GITHUB_ENV: path.join(temp, 'github-env') };
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'create-keychain') writeFileSync(args.at(-1), 'fixture keychain');
    return args.length === 3 && args[0] === 'list-keychains' ? '    "/fixture/login.keychain-db"\n' : '';
  };
  try {
    const setup = setupSigning({ env, run, token: 'fixture-keychain-password' });
    assert.equal(existsSync(path.join(setup.directory, 'certificate.p12')), false);
    const config = JSON.parse(readFileSync(setup.configPath, 'utf8'));
    assert.deepEqual(Object.keys(config).sort(), ['identity', 'notaryProfile', 'teamIdentifier', 'type']);
    const exported = readFileSync(env.GITHUB_ENV, 'utf8');
    for (const secret of [secrets.MAC_CERTIFICATE_PASSWORD, secrets.MAC_NOTARY_APP_PASSWORD, secrets.MAC_CERTIFICATE_P12_BASE64, 'fixture-keychain-password']) assert.ok(!exported.includes(secret));
    assert.ok(calls.some(([command, args]) => command === 'xcrun' && args.includes('--keychain') && args.includes(setup.keychain)));
    cleanupSigning({ env, run });
    assert.equal(existsSync(setup.directory), false);
    assert.deepEqual(calls.at(-1), ['security', ['list-keychains', '-d', 'user', '-s', '/fixture/login.keychain-db']]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('failed import removes p12 and cleanup remains available without secret values', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'ellmsha-ci-signing-failure-'));
  const env = { ...secrets, GITHUB_ACTIONS: 'true', RUNNER_TEMP: temp, GITHUB_ENV: path.join(temp, 'github-env') };
  try {
    assert.throws(() => setupSigning({ env, run: (command, args) => { if (args[0] === 'import') throw new Error('synthetic import failed'); return ''; } }), /import failed/);
    assert.equal(existsSync(path.join(temp, 'ellmsha-signing/certificate.p12')), false);
    assert.equal(existsSync(env.GITHUB_ENV), false);
    cleanupSigning({ env: { GITHUB_ACTIONS: 'true', RUNNER_TEMP: temp }, run: () => '' });
    assert.equal(existsSync(path.join(temp, 'ellmsha-signing')), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
