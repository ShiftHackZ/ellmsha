'use strict';

// Runs inside a real Code OSS extension host. Never reads another app's tokens.
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');

async function probe() {
  const report = {
    observedAt: new Date().toISOString(),
    app: vscode.env.appName,
    version: vscode.version,
    status: 'starting',
    models: [],
  };
  const destination = process.env.ELLMSHA_COPILOT_PROBE_REPORT;
  if (!destination || !path.isAbsolute(destination)) throw new Error('An absolute private report path is required');
  const save = async () => {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  };
  const cancellation = new vscode.CancellationTokenSource();
  const timer = setTimeout(() => cancellation.cancel(), 90_000);
  try {
    report.stage = 'extension_activation';
    const extension = vscode.extensions.getExtension('GitHub.copilot-chat');
    if (!extension) throw Object.assign(new Error('The source-built Copilot extension is not installed in this runtime'), { code: 'missing_copilot_extension' });
    await extension.activate();
    // The user explicitly runs this command; Code OSS handles any consent dialog.
    report.stage = 'model_discovery';
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    report.models = models.map(m => ({ id: m.id, name: m.name, family: m.family, maxInputTokens: m.maxInputTokens, capabilities: m.capabilities }));
    const model = models.find(m => m.id === process.env.ELLMSHA_COPILOT_PROBE_MODEL) || models[0];
    if (!model) {
      report.status = 'no_accessible_models';
      report.nextAction = 'Use the runtime GitHub sign-in and verify organizational access; no token copying or policy changes';
      return report;
    }
    report.selectedModel = model.id;
    report.stage = 'text_request';
    const first = await model.sendRequest([vscode.LanguageModelChatMessage.User('Reply with exactly ELLMSHA_IDE_OK.')], {}, cancellation.token);
    let text = '';
    for await (const part of first.stream) {
      if (part instanceof vscode.LanguageModelTextPart) text += part.value;
    }
    report.textSmoke = text.trim() === 'ELLMSHA_IDE_OK' ? 'pass' : 'unexpected_response';
    const tools = [{ name: 'ellmsha_probe_echo', description: 'Return the supplied harmless marker.', inputSchema: { type: 'object', properties: { marker: { type: 'string', enum: ['ELLMSHA_TOOL_OK'] } }, required: ['marker'], additionalProperties: false } }];
    const messages = [vscode.LanguageModelChatMessage.User('Call ellmsha_probe_echo with marker ELLMSHA_TOOL_OK, then repeat its result.')];
    report.stage = 'tool_request';
    const reply = await model.sendRequest(messages, { tools, toolMode: vscode.LanguageModelChatToolMode.Required }, cancellation.token);
    const parts = [];
    for await (const part of reply.stream) {
      if (part instanceof vscode.LanguageModelTextPart || part instanceof vscode.LanguageModelToolCallPart) parts.push(part);
    }
    const calls = parts.filter(p => p instanceof vscode.LanguageModelToolCallPart);
    if (calls.length !== 1 || calls[0].name !== tools[0].name || calls[0].input?.marker !== 'ELLMSHA_TOOL_OK') {
      report.toolSmoke = 'unexpected_tool_call';
    } else {
      messages.push(vscode.LanguageModelChatMessage.Assistant(parts));
      messages.push(vscode.LanguageModelChatMessage.User([new vscode.LanguageModelToolResultPart(calls[0].callId, [new vscode.LanguageModelTextPart('ELLMSHA_TOOL_OK')])]));
      report.stage = 'tool_result_request';
      const final = await model.sendRequest(messages, {}, cancellation.token);
      let result = '';
      for await (const part of final.stream) if (part instanceof vscode.LanguageModelTextPart) result += part.value;
      report.toolSmoke = result.includes('ELLMSHA_TOOL_OK') ? 'pass' : 'unexpected_response';
    }
    report.status = report.textSmoke === 'pass' && report.toolSmoke === 'pass' ? 'pass' : 'failed';
  } catch (error) {
    // Messages from authentication libraries may contain URLs/tokens. Keep only the typed code.
    report.status = 'blocked';
    report.error = { name: String(error?.name || 'Error'), code: String(error?.code || 'runtime_error') };
  } finally {
    clearTimeout(timer);
    cancellation.cancel();
    cancellation.dispose();
    await save();
  }
  return report;
}

exports.activate = async context => {
  context.subscriptions.push(vscode.commands.registerCommand('ellmsha.copilot.signIn', async () => {
    // User initiated; the native GitHub provider owns authentication and storage.
    // No repository/workflow scopes, raw token handling, or credential export.
    try {
      // Match Copilot's minimum session scope exactly; VS Code session lookup is
      // scope-specific, so a combined read:user/user:email session isn't enough.
      await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });
      await vscode.window.showInformationMessage('GitHub sign-in completed. Run eLLMsha: Probe Copilot IDE Access to check access.');
    } catch (error) {
      const kind = /client.secret|client.id|dev(elopment)? key/i.test(String(error?.message)) ? 'oauth_client_configuration' : 'authentication_failed';
      await fs.writeFile(path.join(path.dirname(process.env.ELLMSHA_COPILOT_PROBE_REPORT), 'authentication-result.json'), JSON.stringify({
        observedAt: new Date().toISOString(), status: 'blocked', kind, code: String(error?.code || 'unknown'),
      }, null, 2) + '\n', { mode: 0o600 });
      await vscode.window.showErrorMessage(`eLLMsha GitHub sign-in: ${kind}. See the sanitized authentication report.`);
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ellmsha.copilot.probe', async () => {
    const report = await probe();
    await vscode.window.showInformationMessage(`eLLMsha Copilot probe: ${report.status}`);
    return report;
  }));
  const readyFile = process.env.ELLMSHA_COPILOT_READY_FILE;
  if (readyFile) {
    await fs.writeFile(readyFile, JSON.stringify({
      instance: process.env.ELLMSHA_COPILOT_INSTANCE, app: vscode.env.appName, version: vscode.version,
      extensionHostPid: process.pid, commandsReady: true,
    }, null, 2) + '\n', { mode: 0o600 });
  }
};

// The source-built runtime's extension test runner calls this, without a shell tool.
exports.run = async () => {
  const report = await probe();
  if (report.status !== 'pass') throw new Error(`Copilot IDE probe: ${report.status}`);
};
