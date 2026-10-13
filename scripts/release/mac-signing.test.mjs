import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { macSigning } from './mac-signing.mjs';
const require = createRequire(import.meta.url);
const { verifySignature } = require('../../aionui/scripts/afterSign.js');

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
