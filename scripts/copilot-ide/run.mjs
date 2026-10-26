import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runtimeEnv } from './runtime-env.mjs';

const extension = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
if (sourceArg < 0 || !args[sourceArg + 1]) {
  console.error('Usage: node scripts/copilot-ide/run.mjs --source SOURCE_CHECKOUT [--interactive]');
  process.exit(2);
}
const source = await realpath(resolve(args[sourceArg + 1]));
const product = JSON.parse(await readFile(join(source, 'product.json'), 'utf8'));
if (product.nameShort !== 'Code - OSS' || product.applicationName !== 'code-oss') {
  throw new Error('This prototype only launches an independently built Code OSS runtime');
}
const executable = join(source, '.build', 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', product.nameShort);
if (process.platform !== 'darwin' || !existsSync(executable) || !existsSync(join(source, 'out', 'main.js'))) {
  throw new Error('Source-built macOS Code OSS runtime is missing; see scripts/copilot-ide/README.md');
}
if (!String(await readFile(join(source, 'src', 'main.ts'))).includes('ELLMSHA_IDE_BACKGROUND')) {
  throw new Error('Apply the background patch and rebuild before launching this prototype');
}
// macOS Unix socket paths are limited to 103 bytes; keep this profile path short.
const state = resolve(extension, '../../.data/copilot-ide');
await mkdir(join(state, 'user-data', 'User'), { recursive: true, mode: 0o700 });
await mkdir(join(state, 'extensions'), { recursive: true, mode: 0o700 });
await mkdir(join(state, 'copilot'), { recursive: true, mode: 0o700 });
await mkdir(join(state, 'shared-data'), { recursive: true, mode: 0o700 });
// This profile has no production workspace, chat data, MCP configuration, or tokens.
await writeFile(join(state, 'user-data', 'User', 'settings.json'), JSON.stringify({
  'telemetry.telemetryLevel': 'off',
  'update.mode': 'none',
  'extensions.autoUpdate': false,
  'extensions.autoCheckUpdates': false,
  'workbench.startupEditor': 'none',
  'security.workspace.trust.enabled': true,
  'github-authentication.preferDeviceCodeFlow': true,
  'chat.agentHost.codexAgent.enabled': false,
  'chat.agentHost.claudeAgent.enabled': false,
}, null, 2), { mode: 0o600 });
const interactive = args.includes('--interactive');
const report = join(dirname(source), 'probe-result.json');
const instance = randomUUID();
const readyFile = join(dirname(source), `runtime-ready-${instance}.json`);
const env = {
  ...runtimeEnv(process.env, state),
  ELLMSHA_COPILOT_PROBE_REPORT: report,
  ELLMSHA_COPILOT_INSTANCE: instance,
  ELLMSHA_COPILOT_READY_FILE: readyFile,
  ...(interactive ? {} : { ELLMSHA_IDE_BACKGROUND: '1' }),
};
if (process.env.ELLMSHA_COPILOT_PROBE_MODEL) env.ELLMSHA_COPILOT_PROBE_MODEL = process.env.ELLMSHA_COPILOT_PROBE_MODEL;
const child = spawn(executable, [
  `${source}/`, '--new-window', '--skip-welcome', '--skip-release-notes',
  `--user-data-dir=${join(state, 'user-data')}`,
  `--shared-data-dir=${join(state, 'shared-data')}`,
  `--extensions-dir=${join(state, 'extensions')}`,
  `--extensionDevelopmentPath=${extension}`,
  `--extensionDevelopmentPath=${join(source, 'extensions', 'copilot')}`,
  '--disable-extension=vscode.vscode-api-tests',
  ...(interactive ? [] : [`--extensionTestsPath=${join(extension, 'probe.cjs')}`]),
], { cwd: source, env, stdio: 'inherit', detached: true });
let stopping = false;
const stop = () => {
  if (!stopping && child.pid) {
    stopping = true;
    // Signal the owning main process only. Killing its workers concurrently
    // caused Code OSS to display renderer-crashed dialogs during setup restarts.
    child.kill('SIGTERM');
  }
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const deadline = interactive ? undefined : setTimeout(stop, 180_000);
let ready = false;
const readiness = setInterval(async () => {
  try {
    const value = JSON.parse(await readFile(readyFile, 'utf8'));
    if (value.instance === instance && value.commandsReady) {
      ready = true;
      clearInterval(readiness);
      clearTimeout(readyDeadline);
      console.log(`Code OSS extension host ready: ${value.extensionHostPid}. GitHub sign-in command registered.`);
    }
  } catch (error) { if (error.code !== 'ENOENT') console.error('Could not read readiness report'); }
}, 250);
const readyDeadline = setTimeout(() => {
  console.error('Code OSS did not confirm extension readiness within 60 seconds');
  stop();
}, 60_000);
child.once('error', error => { console.error(error.message); clearTimeout(deadline); clearTimeout(readyDeadline); clearInterval(readiness); process.exitCode = 1; });
child.once('exit', (code, signal) => {
  clearTimeout(deadline);
  clearTimeout(readyDeadline);
  clearInterval(readiness);
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  console.log(`Code OSS prototype exited: ${signal || code}. Sanitized report: ${report}`);
  process.exitCode = code === 0 && !stopping && ready ? 0 : 1;
});
