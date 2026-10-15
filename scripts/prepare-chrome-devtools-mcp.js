#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { runBuildCommand } = require('./run-build-command');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CHROME_DEVTOOLS_MCP_VERSION = '0.16.0';
const CHROME_DEVTOOLS_MCP_TAG = 'chrome-devtools-mcp-v0.16.0';
const CHROME_DEVTOOLS_MCP_COMMIT = '4f7b06898327ab5be42c85bd98bd176f33d55d89';
const CHROME_DEVTOOLS_MCP_ORIGIN = 'https://github.com/ShiftHackZ/ellmsha-chrome-devtools-mcp.git';
const CHROME_DEVTOOLS_MCP_UPSTREAM = 'https://github.com/ChromeDevTools/chrome-devtools-mcp.git';
const CHROME_DEVTOOLS_MCP_MARKER = '.ellmsha-chrome-devtools-mcp-pin.json';
const CHROME_DEVTOOLS_MCP_SOURCE_DIGEST = '30d8670bf6c0120b677d9687e92decc507df60cc19c95ebe4d6623ad4786facb';
const CHROME_DEVTOOLS_MCP_PATCH_FILES = {
  'tests/McpResponse.test.ts': 'ce2e8c6562573407053fea8e2ada48d43a0a3a8acc11f9da9ca6681273d64274',
  'src/McpResponse.ts': 'dbf6da0bcb2b8375337972b3a6abf7c962df5f1ed5772561aecc7c7040a77ffb',
  'tests/index.test.ts': 'ad81fb7c9d9ccf04953f13b064cbc99bb46f1d730796362d178305cd1ce3c4bd',
  'tests/McpContext.test.ts': 'a61cae2d4cb5dfaef7213664438b3a289649045b4a3e7cf9318d9fa6cdde2d7f',
  'src/main.ts': '9991dae04aa81411a24b1f49d96d053985a6cbfa6a3445e9a4bcf83d4b6f34ac',
  'src/McpContext.ts': 'a45de15cb86cb7e7f33675ada2f9cd846bfb9f448d07055e3a5d3628e9d77069',
  'package-lock.json': '6dd71827cf7e2aefa5953a461649d84c2f07126530fc346f78354ca897ecebba',
  'package.json': '42a7e632039a76783019a57650908c603172a2ec843e3fae7896b26a241af71b',
  'tests/third_party_notices.test.js.snapshot': '1538374ed8fccc58d4417fd91c175f2ed307a3c1f83a4af7537425293cfe9d68',
};

function normalizeRemote(value) {
  return value
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
}

function hashBuildInputs(checkout) {
  const hash = crypto.createHash('sha256');
  const ignoredDirectories = new Set(['build', 'coverage', 'node_modules', 'test-results']);

  function visit(directory, relativeDirectory = '') {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (
        entry.name === '.DS_Store' ||
        entry.name === '.git' ||
        (entry.isDirectory() && ignoredDirectories.has(entry.name))
      ) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      hash.update(relativePath);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isSymbolicLink()) {
        hash.update(`link:${fs.readlinkSync(absolutePath)}`);
      } else if (entry.isFile()) {
        hash.update(fs.readFileSync(absolutePath));
      }
    }
  }

  visit(checkout);
  return hash.digest('hex');
}

function verifySourcePatches(checkout, expectedPatchFiles) {
  for (const [relativePath, expectedHash] of Object.entries(expectedPatchFiles)) {
    const sourcePath = path.join(checkout, relativePath);
    if (!fs.existsSync(sourcePath)) return `expected source patch is missing: ${relativePath}`;
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
    if (actualHash !== expectedHash) return `source patch digest mismatch: ${relativePath}`;
  }
  return undefined;
}

function inspectChromeDevtoolsMcpCheckout(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const checkout = options.checkout ?? path.join(repositoryRoot, 'chrome-devtools-mcp');
  const runGit =
    options.runGit ??
    ((args) =>
      execFileSync('git', ['-C', checkout, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim());
  const packagePath = path.join(checkout, 'package.json');
  const lockPath = path.join(checkout, 'package-lock.json');
  const licensePath = path.join(checkout, 'LICENSE');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Pinned Chrome DevTools MCP checkout is missing at ${checkout}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const lockJson = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : undefined;
  const commit = runGit(['rev-parse', 'HEAD']);
  const origin = runGit(['remote', 'get-url', 'origin']);
  let upstream;
  try {
    upstream = runGit(['remote', 'get-url', 'upstream']);
  } catch {
    upstream = undefined;
  }
  let taggedCommit;
  try {
    taggedCommit = runGit(['rev-parse', `${CHROME_DEVTOOLS_MCP_TAG}^{commit}`]);
  } catch {
    taggedCommit = runGit(['rev-parse', `${CHROME_DEVTOOLS_MCP_COMMIT}^{commit}`]);
  }
  const expectedPatchFiles = options.expectedPatchFiles ?? CHROME_DEVTOOLS_MCP_PATCH_FILES;
  const expectedSourceDigest = options.expectedSourceDigest ?? CHROME_DEVTOOLS_MCP_SOURCE_DIGEST;
  const sourceDigest = hashBuildInputs(checkout);
  const problems = [];

  if (packageJson.version !== CHROME_DEVTOOLS_MCP_VERSION) {
    problems.push(
      `source package version ${packageJson.version ?? '<missing>'}; expected ${CHROME_DEVTOOLS_MCP_VERSION}`
    );
  }
  if (lockJson?.packages?.['']?.version !== CHROME_DEVTOOLS_MCP_VERSION) {
    problems.push(
      `lockfile source version ${lockJson?.packages?.['']?.version ?? '<missing>'}; expected ${CHROME_DEVTOOLS_MCP_VERSION}`
    );
  }
  if (commit !== CHROME_DEVTOOLS_MCP_COMMIT) {
    try {
      runGit(['merge-base', '--is-ancestor', CHROME_DEVTOOLS_MCP_COMMIT, commit]);
    } catch {
      problems.push(`commit ${commit} does not descend from pinned upstream ${CHROME_DEVTOOLS_MCP_COMMIT}`);
    }
  }
  if (taggedCommit !== CHROME_DEVTOOLS_MCP_COMMIT) {
    problems.push(`tag ${CHROME_DEVTOOLS_MCP_TAG} resolves to ${taggedCommit}; expected ${CHROME_DEVTOOLS_MCP_COMMIT}`);
  }
  if (normalizeRemote(origin) !== normalizeRemote(CHROME_DEVTOOLS_MCP_ORIGIN)) {
    problems.push(`origin ${origin}; expected ${CHROME_DEVTOOLS_MCP_ORIGIN}`);
  }
  if (upstream && normalizeRemote(upstream) !== normalizeRemote(CHROME_DEVTOOLS_MCP_UPSTREAM)) {
    problems.push(`upstream ${upstream}; expected ${CHROME_DEVTOOLS_MCP_UPSTREAM}`);
  }
  if (!lockJson) problems.push('package-lock.json is missing');
  if (!fs.existsSync(licensePath)) problems.push('LICENSE is missing');
  const patchProblem = verifySourcePatches(checkout, expectedPatchFiles);
  if (patchProblem) problems.push(patchProblem);
  if (sourceDigest !== expectedSourceDigest) {
    problems.push(`source digest ${sourceDigest}; expected ${expectedSourceDigest}`);
  }
  if (problems.length > 0) {
    throw new Error(`Chrome DevTools MCP checkout does not match the eLLMsha pin:\n- ${problems.join('\n- ')}`);
  }

  return {
    checkout,
    commit,
    sourceDigest,
    upstreamCommit: CHROME_DEVTOOLS_MCP_COMMIT,
    version: CHROME_DEVTOOLS_MCP_VERSION,
  };
}

function verifyChromeDevtoolsMcpRuntime(options) {
  const { runtimeRoot } = options;
  const markerPath = path.join(runtimeRoot, CHROME_DEVTOOLS_MCP_MARKER);
  const required = ['build/src/index.js', 'package.json', 'package-lock.json', 'LICENSE', CHROME_DEVTOOLS_MCP_MARKER];
  const missing = required.filter((relativePath) => !fs.existsSync(path.join(runtimeRoot, relativePath)));
  if (missing.length > 0) {
    throw new Error(`Chrome DevTools MCP runtime is missing required file(s): ${missing.join(', ')}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8'));
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const expected = {
    tag: CHROME_DEVTOOLS_MCP_TAG,
    upstreamCommit: CHROME_DEVTOOLS_MCP_COMMIT,
    version: CHROME_DEVTOOLS_MCP_VERSION,
  };
  if (packageJson.version !== CHROME_DEVTOOLS_MCP_VERSION) {
    throw new Error(
      `Chrome DevTools MCP runtime package version is ${packageJson.version ?? '<missing>'}; expected ${CHROME_DEVTOOLS_MCP_VERSION}`
    );
  }
  for (const [name, value] of Object.entries(expected)) {
    if (marker[name] !== value) {
      throw new Error(
        `Chrome DevTools MCP runtime marker ${name} is ${marker[name] ?? '<missing>'}; expected ${value}`
      );
    }
  }
  const expectedSourceDigest = options.sourceDigest ?? CHROME_DEVTOOLS_MCP_SOURCE_DIGEST;
  if (marker.sourceDigest !== expectedSourceDigest) {
    throw new Error('Chrome DevTools MCP runtime was built from stale checkout contents');
  }
  if (options.sourceCommit && marker.sourceCommit !== options.sourceCommit) {
    throw new Error('Chrome DevTools MCP runtime was built from a different source commit');
  }
  return { checked: required, marker };
}

function prepareChromeDevtoolsMcpRuntime(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const runtimeRoot = options.runtimeRoot ?? path.join(repositoryRoot, '.data', 'chrome-devtools-mcp-runtime');
  const source = inspectChromeDevtoolsMcpCheckout({
    repositoryRoot,
    checkout: options.checkout,
    runGit: options.runGit,
  });

  try {
    verifyChromeDevtoolsMcpRuntime({
      runtimeRoot,
      sourceCommit: source.commit,
      sourceDigest: source.sourceDigest,
    });
    return { ...source, entryPath: path.join(runtimeRoot, 'build', 'src', 'index.js'), runtimeRoot, reused: true };
  } catch {
    // A missing, incomplete, or stale prepared runtime is rebuilt below.
  }

  const npmCache = options.npmCache ?? path.join(repositoryRoot, '.data', 'npm-cache', 'chrome-devtools-mcp');
  fs.mkdirSync(npmCache, { recursive: true });
  const run =
    options.run ??
    ((command, args, cwd) =>
      runBuildCommand(command, args, {
        cwd,
        env: {
          ...process.env,
          HUSKY: '0',
          PUPPETEER_SKIP_DOWNLOAD: 'true',
          npm_config_cache: npmCache,
        },
        stdio: 'inherit',
      }));

  run('npm', ['ci'], source.checkout);
  run('npm', ['run', 'bundle'], source.checkout);

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.cpSync(path.join(source.checkout, 'build'), path.join(runtimeRoot, 'build'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'LICENSE']) {
    fs.copyFileSync(path.join(source.checkout, name), path.join(runtimeRoot, name));
  }
  fs.writeFileSync(
    path.join(runtimeRoot, CHROME_DEVTOOLS_MCP_MARKER),
    `${JSON.stringify(
      {
        sourceCommit: source.commit,
        sourceDigest: source.sourceDigest,
        tag: CHROME_DEVTOOLS_MCP_TAG,
        upstreamCommit: CHROME_DEVTOOLS_MCP_COMMIT,
        version: CHROME_DEVTOOLS_MCP_VERSION,
      },
      null,
      2
    )}\n`
  );
  verifyChromeDevtoolsMcpRuntime({
    runtimeRoot,
    sourceCommit: source.commit,
    sourceDigest: source.sourceDigest,
  });
  return { ...source, entryPath: path.join(runtimeRoot, 'build', 'src', 'index.js'), runtimeRoot, reused: false };
}

if (require.main === module) {
  const result = process.argv.includes('--verify-only')
    ? inspectChromeDevtoolsMcpCheckout()
    : prepareChromeDevtoolsMcpRuntime();
  console.log(`Chrome DevTools MCP ${result.version} pinned at ${result.commit}`);
}

module.exports = {
  CHROME_DEVTOOLS_MCP_COMMIT,
  CHROME_DEVTOOLS_MCP_MARKER,
  CHROME_DEVTOOLS_MCP_ORIGIN,
  CHROME_DEVTOOLS_MCP_PATCH_FILES,
  CHROME_DEVTOOLS_MCP_SOURCE_DIGEST,
  CHROME_DEVTOOLS_MCP_TAG,
  CHROME_DEVTOOLS_MCP_UPSTREAM,
  CHROME_DEVTOOLS_MCP_VERSION,
  hashBuildInputs,
  inspectChromeDevtoolsMcpCheckout,
  normalizeRemote,
  prepareChromeDevtoolsMcpRuntime,
  verifyChromeDevtoolsMcpRuntime,
  verifySourcePatches,
};
