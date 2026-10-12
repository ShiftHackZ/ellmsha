import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { normalizeLinearImages } from './normalize-linear-images.mjs';

// The account-owned mcp-remote process still owns authentication and all RPCs.
// Normalize only extract_images input; never rewrite provider results or writes.
export function normalizeImageRequest(line) {
  try {
    const request = JSON.parse(line);
    if (request.method !== 'tools/call' || request.params?.name !== 'extract_images') return line;
    const args = request.params.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return line;
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') args[key] = normalizeLinearImages(value);
    }
    return JSON.stringify(request);
  } catch {
    return line;
  }
}

function requestStream() {
  let pending = '';
  return new Transform({
    decodeStrings: false,
    transform(chunk, _encoding, done) {
      pending += chunk;
      // Bound a malformed/non-newline input before forwarding anything.
      if (Buffer.byteLength(pending) > 16 * 1024 * 1024) {
        done(new Error('MCP request exceeds the adapter frame limit'));
        return;
      }
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        this.push(`${normalizeImageRequest(pending.slice(0, end))}\n`);
        pending = pending.slice(end + 1);
      }
      done();
    },
    flush(done) {
      if (pending.trim()) this.push(`${normalizeImageRequest(pending)}\n`);
      done();
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error('Missing MCP transport command');
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  process.stdin.setEncoding('utf8');
  const requests = requestStream();
  const stop = () => { if (!child.killed) child.kill(); };
  requests.on('error', () => { process.exitCode = 1; stop(); });
  child.stdin.on('error', stop);
  child.on('error', () => { process.stderr.write('Linear MCP transport failed to start.\n'); process.exit(1); });
  child.on('close', (code) => {
    process.exitCode = code ?? 1;
    process.stdin.unpipe(requests);
    process.stdin.pause();
    requests.destroy();
    // Let stdout drain naturally; process.exit can truncate the last RPC.
  });
  process.stdin.pipe(requests).pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
