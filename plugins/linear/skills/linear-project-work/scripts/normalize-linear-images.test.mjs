import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeLinearImages } from './normalize-linear-images.mjs';

function nativeImage(source, extra = {}) {
  return `<linear-image>${JSON.stringify({
    type: 'image',
    attrs: { src: source, title: 'Screenshot', width: 1280, height: 720, ...extra },
  })}</linear-image>`;
}

test('converts native Linear uploads to the advertised Markdown input', () => {
  const source = 'https://uploads.linear.app/example/screenshot.png?signature=private';
  assert.equal(normalizeLinearImages(nativeImage(source)), `![Linear image](${source})`);
});

test('preserves existing Markdown and converts multiple native images', () => {
  const first = 'https://uploads.linear.app/a.png?sig=one';
  const second = 'https://uploads.linear.app/b.png?sig=two';
  const input = `![Existing](https://uploads.linear.app/existing.png)\n${nativeImage(first)}\n${nativeImage(second)}`;
  assert.equal(
    normalizeLinearImages(input),
    `![Existing](https://uploads.linear.app/existing.png)\n![Linear image](${first})\n![Linear image](${second})`,
  );
});

test('does not convert external or lookalike origins', () => {
  for (const source of [
    'https://example.com/image.png',
    'https://uploads.linear.app.example.com/image.png',
    'http://uploads.linear.app/image.png',
    'https://uploads.linear.app:444/image.png',
  ]) {
    const input = nativeImage(source);
    assert.equal(normalizeLinearImages(input), input);
  }
});

test('does not let an allowed-origin URL inject another Markdown image', () => {
  for (const source of [
    'https://uploads.linear.app/a) ![Injected](https://example.com/image.png',
    'https://uploads.linear.app/a.png\n![Injected](https://example.com/image.png)',
    'https://uploads.linear.app/a\\)![Injected](https://example.com/image.png)',
  ]) {
    const input = nativeImage(source);
    assert.equal(normalizeLinearImages(input), input);
  }
});

test('leaves malformed and non-image nodes unchanged', () => {
  const malformed = '<linear-image>{not-json}</linear-image>';
  const file = '<linear-image>{"type":"file","attrs":{"src":"https://uploads.linear.app/file"}}</linear-image>';
  assert.equal(normalizeLinearImages(malformed), malformed);
  assert.equal(normalizeLinearImages(file), file);
});

test('CLI emits normalized content without writing a file', async () => {
  const { spawn } = await import('node:child_process');
  const source = 'https://uploads.linear.app/cli.png?sig=private';
  const child = spawn(process.execPath, [fileURLToPath(new URL('./normalize-linear-images.mjs', import.meta.url))], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end(nativeImage(source));

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, `![Linear image](${source})`);
});
