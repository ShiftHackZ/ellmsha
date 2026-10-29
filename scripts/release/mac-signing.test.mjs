import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { electronBuilderIdentity, macSigning } from './mac-signing.mjs';
const require = createRequire(import.meta.url);
const { verifySignature, verifyApplicationSignature } = require('../../aionui/scripts/afterSign.js');

test('only the electron-builder selector loses the Developer ID prefix', () => {
  const identity = 'Developer ID Application: Fixture (ABCDEFGHIJ)';
  assert.equal(electronBuilderIdentity(identity), 'Fixture (ABCDEFGHIJ)');
  assert.equal(identity, 'Developer ID Application: Fixture (ABCDEFGHIJ)');
  assert.equal(electronBuilderIdentity('Apple Development: Fixture'), 'Apple Development: Fixture');
  assert.throws(() => electronBuilderIdentity('Developer ID Application: '), /non-empty/);
});

test('main app and native helper require the exact full certificate, team and stable requirement', () => {
  const identity = 'Developer ID Application: Fixture (ABCDEFGHIJ)';
  const env = { ELLM_SHA_SIGNING_REQUIRED: '1', ELLM_SHA_SIGNING_TEAM: 'ABCDEFGHIJ', ELLM_SHA_SIGNING_IDENTITY: identity };
  const appPath = '/fixture/eLLMsha.app';
  const run = () => '';
  const inspect = (_command, args) => ({ status: 0, stdout: '', stderr: args.includes('-r-') ? 'designated => identifier "fixture" and anchor apple generic' : `Authority=${identity}\nTeamIdentifier=ABCDEFGHIJ\n` });
  const inspected = [];
  verifyApplicationSignature(appPath, env, run, (command, args) => { inspected.push(args.at(-1)); return inspect(command, args); });
  assert.deepEqual([...new Set(inspected)], [appPath, `${appPath}/Contents/Resources/open-computer-use/Open Computer Use.app`, `${appPath}/Contents/Resources/app.asar.unpacked/out/main/native/security-key/security-key.node`]);
  assert.throws(() => verifyApplicationSignature(appPath, env, run, (command, args) => ({ ...inspect(command, args), stderr: 'Authority=Developer ID Application: Other (ABCDEFGHIJ)\nTeamIdentifier=ABCDEFGHIJ\n' })), /exact selected/);
  assert.throws(() => verifyApplicationSignature(appPath, env, run, (command, args) => args.includes('-r-') ? { status: 0, stdout: 'designated => cdhash H"fixture"', stderr: '' } : inspect(command, args)), /stable certificate/);
});

test('external configuration opts this host into certificate signing, never ad-hoc', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(),'ellmsha-signing-test-'));
  const root = path.join(temp,'repo'); mkdirSync(root);
  const file = path.join(temp,'signing.json');
  const opts = {root,home:temp,env:{ELLM_SHA_MAC_SIGNING_CONFIG:file}};
  try {
    assert.equal(macSigning(opts),null);
    assert.throws(()=>macSigning({...opts,enabled:true}),/requires/);
    const valid={identity:'Apple Development: Fixture',teamIdentifier:'ABCDEFGHIJ',type:'development'};
    writeFileSync(file,JSON.stringify(valid));
    assert.deepEqual(macSigning(opts),valid);
    assert.equal(macSigning({...opts,disabled:true}),null);
    writeFileSync(file,JSON.stringify({...valid,identity:'  Developer ID Application: Fixture (ABCDEFGHIJ)  ',type:'distribution'}));
    assert.equal(macSigning(opts).identity,'Developer ID Application: Fixture (ABCDEFGHIJ)');
    for (const identity of ['Fixture', 'a'.repeat(40), 'Developer ID Application: ', 'Apple Development: ', '\nApple Development: Fixture']) {
      writeFileSync(file,JSON.stringify({...valid,identity}));
      assert.throws(()=>macSigning(opts),/full Apple Development/);
    }
    writeFileSync(file,JSON.stringify({...valid,identity:'-'}));
    assert.throws(()=>macSigning(opts),/explicit/);
    writeFileSync(file,JSON.stringify({...valid,password:'not-a-real-secret'}));
    assert.throws(()=>macSigning(opts),/Unsupported/);
    const tracked=path.join(root,'signing.json');writeFileSync(tracked,JSON.stringify(valid));
    const link=path.join(temp,'link.json');symlinkSync(tracked,link);
    assert.throws(()=>macSigning({...opts,env:{ELLM_SHA_MAC_SIGNING_CONFIG:link}}),/outside/);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

test('verification failure cannot trigger a fallback signature',()=>{
  const calls=[];
  assert.throws(()=>verifySignature('/tmp/fixture.app',(command,args)=>{
    calls.push([command,args]);throw new Error('invalid signature');
  }),/invalid signature/);
  assert.equal(calls.length,1);
  assert.ok(calls[0][1].includes('--verify'));
  assert.ok(!calls[0][1].includes('--sign'));
});
