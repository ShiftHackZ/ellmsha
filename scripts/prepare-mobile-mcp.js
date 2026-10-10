#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { runBuildCommand } = require('./run-build-command');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MOBILE_MCP_VERSION = '1.0.8';
const MOBILE_MCP_SOURCE_VERSION = '0.0.1';
const MOBILE_MCP_COMMIT = '65953016441e1f519d47c98d7bcc742647249c95';
const MOBILE_MCP_ORIGIN = 'https://github.com/ShiftHackZ/ellmsha-mobile-mcp.git';
const MOBILE_MCP_UPSTREAM = 'https://github.com/mobile-next/mobile-mcp.git';
const MOBILE_MCP_MARKER = '.ellmsha-mobile-mcp-pin.json';
const MOBILE_MCP_SOURCE_DIGEST = '2bf52e186569971f18fe78319ce14427ae3299ce059fbf5716f39d9f1c2666ad';
const MOBILE_MCP_PATCH_FILES = {
  'package-lock.json': '2812d7a424bbc434cdd9cb3322a872415e88f8c374c1305a8160a97c563c72ba',
  'package.json': 'f1087b07d8b14039206906e434aa98cc1cfdc74819494a9a1ca8081a80d3c7df',
};

function normalizeRemote(value) {
  return value
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
}

function expectedRemote(value) {
  return normalizeRemote(value);
}

function hashBuildInputs(checkout) {
  const hash = crypto.createHash('sha256');
  const ignoredDirectories = new Set(['coverage', 'lib', 'node_modules', 'test-results']);

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

function inspectMobileMcpCheckout(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const checkout = options.checkout ?? path.join(repositoryRoot, 'mobile-mcp');
  const runGit =
    options.runGit ??
    ((args) =>
      execFileSync('git', ['-C', checkout, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim());

  const packagePath = path.join(checkout, 'package.json');
  const lockPath = path.join(checkout, 'package-lock.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Pinned Mobile MCP checkout is missing at ${checkout}`);
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
  let releaseCommit;
  try {
    releaseCommit = runGit(['rev-parse', `${MOBILE_MCP_VERSION}^{commit}`]);
  } catch {
    releaseCommit = runGit(['rev-parse', `${MOBILE_MCP_COMMIT}^{commit}`]);
  }
  const expectedPatchFiles = options.expectedPatchFiles ?? MOBILE_MCP_PATCH_FILES;
  const expectedSourceDigest = options.expectedSourceDigest ?? MOBILE_MCP_SOURCE_DIGEST;
  const sourceDigest = hashBuildInputs(checkout);
  const problems = [];

  if (packageJson.version !== MOBILE_MCP_SOURCE_VERSION) {
    problems.push(
      `source package version ${packageJson.version ?? '<missing>'}; expected ${MOBILE_MCP_SOURCE_VERSION}`
    );
  }
  if (lockJson?.packages?.['']?.version !== MOBILE_MCP_SOURCE_VERSION) {
    problems.push(
      `lockfile source version ${lockJson?.packages?.['']?.version ?? '<missing>'}; expected ${MOBILE_MCP_SOURCE_VERSION}`
    );
  }
  if (commit !== MOBILE_MCP_COMMIT) {
    try {
      runGit(['merge-base', '--is-ancestor', MOBILE_MCP_COMMIT, commit]);
    } catch {
      problems.push(`commit ${commit} does not descend from pinned release ${MOBILE_MCP_COMMIT}`);
    }
  }
  if (releaseCommit !== MOBILE_MCP_COMMIT) {
    problems.push(`release ref resolves to ${releaseCommit}; expected ${MOBILE_MCP_COMMIT}`);
  }
  if (normalizeRemote(origin) !== expectedRemote(MOBILE_MCP_ORIGIN)) {
    problems.push(`origin ${origin}; expected ${MOBILE_MCP_ORIGIN}`);
  }
  if (upstream && normalizeRemote(upstream) !== expectedRemote(MOBILE_MCP_UPSTREAM)) {
    problems.push(`upstream ${upstream}; expected ${MOBILE_MCP_UPSTREAM}`);
  }
  if (!lockJson) {
    problems.push('package-lock.json is missing');
  }
  const patchProblem = verifySourcePatches(checkout, expectedPatchFiles);
  if (patchProblem) problems.push(patchProblem);
  if (sourceDigest !== expectedSourceDigest) {
    problems.push(`source digest ${sourceDigest}; expected ${expectedSourceDigest}`);
  }
  if (problems.length > 0) {
    throw new Error(`Mobile MCP checkout does not match the eLLMsha pin:\n- ${problems.join('\n- ')}`);
  }

  return {
    checkout,
    commit,
    pinnedCommit: MOBILE_MCP_COMMIT,
    releaseVersion: MOBILE_MCP_VERSION,
    sourceDigest,
    sourceVersion: packageJson.version,
    version: MOBILE_MCP_VERSION,
  };
}

function mobileCliTarget(platform, arch) {
  const platformName = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[platform];
  const archName = { arm64: 'arm64', x64: 'amd64' }[arch];
  if (!platformName || !archName) {
    throw new Error(`Mobile MCP does not support target ${platform}-${arch}`);
  }
  return `${platformName}-${archName}`;
}

function verifyMobileMcpRuntime(options) {
  const { runtimeRoot, targetPlatform = process.platform, targetArch = process.arch } = options;
  const target = mobileCliTarget(targetPlatform, targetArch);
  const markerPath = path.join(runtimeRoot, MOBILE_MCP_MARKER);
  const required = [
    'lib/index.js',
    'package.json',
    'package-lock.json',
    'LICENSE',
    'node_modules/mobilewright/package.json',
    `node_modules/@mobilenext/mobilecli-${target}/package.json`,
    `node_modules/@mobilenext/mobilecli-${target}/mobilecli-${target}${targetPlatform === 'win32' ? '.exe' : ''}`,
    MOBILE_MCP_MARKER,
  ];
  const missing = required.filter((relativePath) => !fs.existsSync(path.join(runtimeRoot, relativePath)));
  if (missing.length > 0) {
    throw new Error(`Mobile MCP runtime is missing required file(s): ${missing.join(', ')}`);
  }

  // A copied npm bin link must never point back to the build checkout.
  const resolvedRoot = fs.realpathSync(runtimeRoot);
  function verifyLinks(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const relative = path.relative(resolvedRoot, fs.realpathSync(file));
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error(`Mobile MCP runtime link escapes its bundle: ${path.relative(runtimeRoot, file)}`);
        }
      } else if (entry.isDirectory()) verifyLinks(file);
    }
  }
  verifyLinks(runtimeRoot);

  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const expected = {
    pinnedCommit: MOBILE_MCP_COMMIT,
    releaseVersion: MOBILE_MCP_VERSION,
    sourceVersion: MOBILE_MCP_SOURCE_VERSION,
    platform: targetPlatform,
    arch: targetArch,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (marker[name] !== value) {
      throw new Error(`Mobile MCP runtime marker ${name} is ${marker[name] ?? '<missing>'}; expected ${value}`);
    }
  }
  const expectedSourceDigest = options.sourceDigest ?? MOBILE_MCP_SOURCE_DIGEST;
  if (marker.sourceDigest !== expectedSourceDigest) {
    throw new Error('Mobile MCP runtime was built from stale checkout contents');
  }
  if (options.sourceCommit && marker.sourceCommit !== options.sourceCommit) {
    throw new Error('Mobile MCP runtime was built from a different source commit');
  }
  if (targetPlatform !== 'win32') {
    const executable = path.join(runtimeRoot, required[6]);
    try {
      fs.accessSync(executable, fs.constants.X_OK);
    } catch {
      throw new Error(`Mobile MCP target binary is not executable: ${executable}`);
    }
  }
  return { checked: required, marker, target };
}

function prepareMobileMcpRuntime(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const runtimeRoot = options.runtimeRoot ?? path.join(repositoryRoot, '.data', 'mobile-mcp-runtime');
  const targetPlatform = options.targetPlatform ?? process.platform;
  const targetArch = options.targetArch ?? process.arch;
  if (targetPlatform !== process.platform || targetArch !== process.arch) {
    throw new Error(
      `Mobile MCP runtime must be built on its target host; requested ${targetPlatform}-${targetArch}, current host is ${process.platform}-${process.arch}`
    );
  }
  const source = inspectMobileMcpCheckout({
    repositoryRoot,
    checkout: options.checkout,
    runGit: options.runGit,
  });
  const marker = {
    sourceCommit: source.commit,
    pinnedCommit: MOBILE_MCP_COMMIT,
    releaseVersion: MOBILE_MCP_VERSION,
    sourceVersion: source.sourceVersion,
    sourceDigest: source.sourceDigest,
    platform: targetPlatform,
    arch: targetArch,
  };

  try {
    verifyMobileMcpRuntime({
      runtimeRoot,
      sourceCommit: source.commit,
      sourceDigest: source.sourceDigest,
      targetPlatform,
      targetArch,
    });
    return { ...source, entryPath: path.join(runtimeRoot, 'lib', 'index.js'), runtimeRoot, reused: true };
  } catch {
    // A missing, incomplete, wrong-target, or stale runtime is rebuilt below.
  }

  const run =
    options.run ??
    ((command, args, cwd) =>
      runBuildCommand(command, args, {
        cwd,
        env: { ...process.env, HUSKY: '0' },
        stdio: 'inherit',
      }));

  run('npm', ['ci'], source.checkout);
  run('npm', ['run', 'build'], source.checkout);

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const name of ['lib', 'node_modules']) {
    fs.cpSync(path.join(source.checkout, name), path.join(runtimeRoot, name), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  for (const name of ['package.json', 'package-lock.json', 'LICENSE']) {
    fs.copyFileSync(path.join(source.checkout, name), path.join(runtimeRoot, name));
  }
  run('npm', ['prune', '--omit=dev'], runtimeRoot);
  fs.writeFileSync(path.join(runtimeRoot, MOBILE_MCP_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  verifyMobileMcpRuntime({
    runtimeRoot,
    sourceCommit: source.commit,
    sourceDigest: source.sourceDigest,
    targetPlatform,
    targetArch,
  });

  return { ...source, entryPath: path.join(runtimeRoot, 'lib', 'index.js'), runtimeRoot, reused: false };
}

if (require.main === module) {
  const result = process.argv.includes('--verify-only') ? inspectMobileMcpCheckout() : prepareMobileMcpRuntime();
  console.log(`Mobile MCP ${result.releaseVersion} pinned at ${result.commit}`);
}

module.exports = {
  MOBILE_MCP_COMMIT,
  MOBILE_MCP_MARKER,
  MOBILE_MCP_ORIGIN,
  MOBILE_MCP_PATCH_FILES,
  MOBILE_MCP_SOURCE_DIGEST,
  MOBILE_MCP_SOURCE_VERSION,
  MOBILE_MCP_UPSTREAM,
  MOBILE_MCP_VERSION,
  hashBuildInputs,
  inspectMobileMcpCheckout,
  mobileCliTarget,
  normalizeRemote,
  prepareMobileMcpRuntime,
  verifyMobileMcpRuntime,
  verifySourcePatches,
};
