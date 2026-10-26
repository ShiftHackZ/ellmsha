import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.indexOf('--source');
if (at < 0 || !args[at + 1]) throw new Error('Usage: node scripts/copilot-ide/stage-runtime.mjs --source SOURCE_CHECKOUT');
const source = resolve(args[at + 1]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destinationArg = args.indexOf('--destination');
const destination = destinationArg >= 0 ? resolve(args[destinationArg + 1]) : join(root, 'aionui/resources/copilot-ide');
const product = JSON.parse(await readFile(join(source, 'product.json'), 'utf8'));
if (product.nameShort !== 'Code - OSS' || product.applicationName !== 'code-oss') throw new Error('Expected source-built Code OSS');
if (!(await readFile(join(source, 'src/main.ts'), 'utf8')).includes('ELLMSHA_IDE_BACKGROUND')) throw new Error('Background patch is required');
await access(join(source, 'out/main.js'));
await mkdir(destination, { recursive: true });
// Preserve the known working source build, including its native modules and
// first-party authentication/Copilot extensions. Pruning needs separate native
// acceptance; do not silently omit runtime dependencies to reduce artifact size.
for (const entry of ['.build/electron', 'out', 'node_modules', 'extensions', 'product.json', 'package.json', 'src/main.ts', 'LICENSE.txt', 'ThirdPartyNotices.txt']) {
  await cp(join(source, entry), join(destination, entry), { recursive: true, dereference: false, verbatimSymlinks: true, filter: file => !file.split(/[\\/]/).includes('.git') });
}
let provenance;
try { provenance = JSON.parse(await readFile(join(dirname(source), 'source-manifest.json'), 'utf8')); } catch { /* no asserted commit without provenance */ }
await writeFile(join(destination, 'ellmsha-runtime.json'), JSON.stringify({
  repository: 'https://github.com/microsoft/vscode',
  sourceVersion: JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version,
  sourceCommit: provenance?.repository === 'https://github.com/microsoft/vscode' ? provenance.commit : null,
  builtPlatform: process.platform, builtArch: process.arch,
  stagedAt: new Date().toISOString(), extensions: 'Source-built upstream extensions; no Marketplace binaries',
}, null, 2) + '\n');
console.log('Staged embedded Code OSS runtime without user data or authentication state');
