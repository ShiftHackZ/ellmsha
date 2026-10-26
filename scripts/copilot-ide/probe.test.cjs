'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// Contract tests for the probe only; these are not real Copilot acceptance.
async function check({ noModels = false, failure = false, wrongTool = false } = {}) {
  let saved;
  let requests = 0;
  let thirdRequest;
  class Text { constructor(value) { this.value = value; } }
  class Call { constructor(callId, name, input) { Object.assign(this, { callId, name, input }); } }
  class Result { constructor(callId, content) { Object.assign(this, { callId, content }); } }
  const message = (role, content) => ({ role, content });
  const model = {
    id: 'test-only', name: 'Test only', family: 'test', maxInputTokens: 1024,
    async sendRequest(messages) {
      requests++;
      if (failure) throw Object.assign(new Error('Do not save private-token-123 https://example.test/?token=secret'), { code: 'NoPermissions' });
      if (requests === 3) thirdRequest = messages;
      const parts = requests === 1 ? [new Text('ELLMSHA_IDE_OK')] : requests === 2
        ? [new Call('call-1', wrongTool ? 'untrusted_tool' : 'ellmsha_probe_echo', { marker: 'ELLMSHA_TOOL_OK' })]
        : [new Text('ELLMSHA_TOOL_OK')];
      return { stream: (async function* () { yield* parts; })() };
    },
  };
  const api = {
    version: 'test', env: { appName: 'Code - OSS' },
    extensions: { getExtension: () => ({ activate: async () => {} }) },
    lm: { selectChatModels: async () => noModels ? [] : [model] },
    LanguageModelTextPart: Text, LanguageModelToolCallPart: Call, LanguageModelToolResultPart: Result,
    LanguageModelChatMessage: { User: content => message('user', content), Assistant: content => message('assistant', content) },
    LanguageModelChatToolMode: { Required: 2 },
    CancellationTokenSource: class { token = {}; cancel() {} dispose() {} },
  };
  const context = {
    exports: {}, process: { env: { ELLMSHA_COPILOT_PROBE_REPORT: '/test/report.json' } },
    setTimeout, clearTimeout,
    require(name) {
      if (name === 'vscode') return api;
      if (name === 'node:fs/promises') return { mkdir: async () => {}, writeFile: async (_file, body) => { saved = JSON.parse(body); } };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(__dirname + '/probe.cjs', 'utf8'), context);
  let error;
  try { await context.exports.run(); } catch (caught) { error = caught; }
  return { saved, error, requests, thirdRequest };
}

test('text and validated tool result must both pass', async () => {
  const out = await check();
  assert.equal(out.error, undefined);
  assert.equal(out.saved.status, 'pass');
  assert.equal(out.requests, 3);
  assert.equal(out.thirdRequest[2].content[0].callId, 'call-1');
  assert.equal(out.thirdRequest[2].content[0].content[0].value, 'ELLMSHA_TOOL_OK');
});
test('no accessible models cannot be accepted as success', async () => {
  const out = await check({ noModels: true });
  assert.ok(out.error);
  assert.equal(out.saved.status, 'no_accessible_models');
  assert.equal(out.requests, 0);
});
test('an unexpected tool is never executed or returned as a success', async () => {
  const out = await check({ wrongTool: true });
  assert.ok(out.error);
  assert.equal(out.saved.toolSmoke, 'unexpected_tool_call');
  assert.equal(out.requests, 2);
});
test('policy failures retain code but never token-bearing provider messages', async () => {
  const out = await check({ failure: true });
  assert.ok(out.error);
  assert.equal(out.saved.status, 'blocked');
  assert.equal(out.saved.error.code, 'NoPermissions');
  assert.doesNotMatch(JSON.stringify(out.saved), /private-token|example\.test|secret/);
});
