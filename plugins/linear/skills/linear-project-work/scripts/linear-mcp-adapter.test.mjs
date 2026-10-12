import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeImageRequest } from './linear-mcp-adapter.mjs';

const native = '<linear-image>{"type":"image","attrs":{"src":"https://uploads.linear.app/fixture.png"}}</linear-image>';
test('extract_images accepts native images without a model-run conversion', () => {
  const line = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'extract_images', arguments: { markdown: native } } });
  const request = JSON.parse(normalizeImageRequest(line));
  assert.equal(request.params.arguments.markdown, '![Linear image](https://uploads.linear.app/fixture.png)');
  assert.equal(request.id, 2);
});

test('all other methods, mutations, invalid nodes and malformed JSON remain unchanged', () => {
  for (const line of [
    'not json',
    JSON.stringify({ method: 'initialize', id: 1 }),
    JSON.stringify({ method: 'tools/call', params: { name: 'update_issue', arguments: { description: native } } }),
  ]) assert.equal(normalizeImageRequest(line), line);
  const unsafe = native.replace('https://uploads.linear.app/fixture.png', 'https://example.test/fixture.png');
  const line = JSON.stringify({ method: 'tools/call', params: { name: 'extract_images', arguments: { markdown: unsafe } } });
  assert.equal(JSON.parse(normalizeImageRequest(line)).params.arguments.markdown, unsafe);
});

test('stdio preserves request IDs, unicode, other tools and clean EOF with an isolated fake upstream', { timeout: 5000 }, async (t) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./linear-mcp-adapter.mjs', import.meta.url)), process.execPath, '-e', 'process.stdin.pipe(process.stdout)']);
  t.after(() => child.kill());
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });
  const finished = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  child.stdin.end(`${JSON.stringify({ id: 1, method: 'ping' })}\n${JSON.stringify({ id: 2, method: 'tools/call', params: { name: 'extract_images', arguments: { markdown: `Знімок ${native}` } } })}\n`);
  assert.equal(await finished, 0);
  const lines = output.trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines[0], { id: 1, method: 'ping' });
  assert.equal(lines[1].params.arguments.markdown, 'Знімок ![Linear image](https://uploads.linear.app/fixture.png)');
});

test('upstream EOF drains a large response through a slow consumer without truncation', { timeout: 5000 }, async (t) => {
  const size = 4 * 1024 * 1024;
  const child = spawn(process.execPath, [fileURLToPath(new URL('./linear-mcp-adapter.mjs', import.meta.url)), process.execPath, '-e', `process.stdout.write('x'.repeat(${size}))`]);
  t.after(() => child.kill());
  let received = 0;
  child.stdout.on('data', chunk => {
    received += chunk.length;
    child.stdout.pause();
    setTimeout(() => child.stdout.resume(), 1);
  });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0);
  assert.equal(received, size);
});
