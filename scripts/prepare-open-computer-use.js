#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OPEN_COMPUTER_USE_VERSION = '0.3.6';
const OPEN_COMPUTER_USE_COMMIT = '3908413ac48bdfa1f98226bc2b84272bc13378ae';
const OPEN_COMPUTER_USE_UPSTREAM_COMMIT = '83a521e546102564efd002f61a6763912081e5c7';
const OPEN_COMPUTER_USE_ORIGIN = 'https://github.com/ShiftHackZ/ellmsha-open-codex-computer-use.git';
const OPEN_COMPUTER_USE_UPSTREAM = 'https://github.com/iFurySt/open-codex-computer-use.git';
const OPEN_COMPUTER_USE_MARKER = '.ellmsha-open-computer-use-pin.json';

function normalizeRemote(value) {
  return value
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
}

function hashBuildInputs(checkout) {
  const hash = crypto.createHash('sha256');
  const ignoredDirectories = new Set(['.build', 'coverage', 'dist', 'test-results']);

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
      const relativePath = path.join(relativeDirectory, entry.name);
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

function inspectOpenComputerUseCheckout(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const checkout = options.checkout ?? path.join(repositoryRoot, 'open-codex-computer-use');
  const runGit =
    options.runGit ??
    ((args) =>
      execFileSync('git', ['-C', checkout, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim());
  const manifestPath = path.join(checkout, 'plugins', 'open-computer-use', '.codex-plugin', 'plugin.json');
  const licensePath = path.join(checkout, 'LICENSE');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Pinned Open Computer Use checkout is missing at ${checkout}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const commit = runGit(['rev-parse', 'HEAD']);
  const origin = runGit(['remote', 'get-url', 'origin']);
  let upstream;
  try {
    upstream = runGit(['remote', 'get-url', 'upstream']);
  } catch {
    upstream = undefined;
  }
  const checkoutChanges = runGit(['status', '--porcelain', '--untracked-files=all']);
  const problems = [];

  if (manifest.version !== OPEN_COMPUTER_USE_VERSION) {
    problems.push(`source version ${manifest.version ?? '<missing>'}; expected ${OPEN_COMPUTER_USE_VERSION}`);
  }
  if (commit !== OPEN_COMPUTER_USE_COMMIT) {
    problems.push(`commit ${commit}; expected ${OPEN_COMPUTER_USE_COMMIT}`);
  }
  try {
    runGit(['merge-base', '--is-ancestor', OPEN_COMPUTER_USE_UPSTREAM_COMMIT, commit]);
  } catch {
    problems.push(`commit ${commit} does not descend from pinned upstream ${OPEN_COMPUTER_USE_UPSTREAM_COMMIT}`);
  }
  if (normalizeRemote(origin) !== normalizeRemote(OPEN_COMPUTER_USE_ORIGIN)) {
    problems.push(`origin ${origin}; expected ${OPEN_COMPUTER_USE_ORIGIN}`);
  }
  if (upstream && normalizeRemote(upstream) !== normalizeRemote(OPEN_COMPUTER_USE_UPSTREAM)) {
    problems.push(`upstream ${upstream}; expected ${OPEN_COMPUTER_USE_UPSTREAM}`);
  }
  if (!fs.existsSync(licensePath) || !fs.readFileSync(licensePath, 'utf8').startsWith('MIT License')) {
    problems.push('MIT LICENSE is missing or unexpected');
  }
  if (checkoutChanges) problems.push(`checkout changes are present: ${checkoutChanges.replace(/\n/g, ', ')}`);
  if (problems.length > 0) {
    throw new Error(`Open Computer Use checkout does not match the eLLMsha pin:\n- ${problems.join('\n- ')}`);
  }

  return {
    checkout,
    commit,
    sourceDigest: hashBuildInputs(checkout),
    upstreamCommit: OPEN_COMPUTER_USE_UPSTREAM_COMMIT,
    version: OPEN_COMPUTER_USE_VERSION,
  };
}

function normalizeArch(arch) {
  const normalized = { amd64: 'x64', arm64: 'arm64', x64: 'x64' }[arch];
  if (!normalized) throw new Error(`Open Computer Use does not support architecture ${arch}`);
  return normalized;
}

function assertSupportedTarget(platform, arch) {
  if (!['darwin', 'linux', 'win32'].includes(platform)) {
    throw new Error(`Open Computer Use does not support target ${platform}-${arch}`);
  }
  normalizeArch(arch);
}

function runtimeEntryRelativePath(platform) {
  if (platform === 'darwin') return path.join('Open Computer Use.app', 'Contents', 'MacOS', 'OpenComputerUse');
  if (platform === 'linux') return 'open-computer-use';
  if (platform === 'win32') return 'open-computer-use.exe';
  throw new Error(`Open Computer Use does not support target platform ${platform}`);
}

function assertNativeBuildTarget(targetPlatform, targetArch) {
  assertSupportedTarget(targetPlatform, targetArch);
  if (targetPlatform !== process.platform || normalizeArch(targetArch) !== normalizeArch(process.arch)) {
    throw new Error(
      `Open Computer Use runtime must be built on its target host; requested ${targetPlatform}-${targetArch}, current host is ${process.platform}-${process.arch}`
    );
  }
}

function assertMacOSVersion(runCapture) {
  const version = runCapture('sw_vers', ['-productVersion']).trim();
  const major = Number.parseInt(version.split('.')[0], 10);
  if (!Number.isInteger(major) || major < 14) {
    throw new Error(`Open Computer Use requires macOS 14.0 or later; current version is ${version || '<unknown>'}`);
  }
}

function verifyOpenComputerUseRuntime(options) {
  const { runtimeRoot, targetPlatform = process.platform, targetArch = process.arch } = options;
  assertSupportedTarget(targetPlatform, targetArch);
  const entryPath = path.join(runtimeRoot, runtimeEntryRelativePath(targetPlatform));
  const required = [runtimeEntryRelativePath(targetPlatform), 'LICENSE', OPEN_COMPUTER_USE_MARKER];
  const missing = required.filter((relativePath) => !fs.existsSync(path.join(runtimeRoot, relativePath)));
  if (missing.length > 0) {
    throw new Error(`Open Computer Use runtime is missing required file(s): ${missing.join(', ')}`);
  }

  const marker = JSON.parse(fs.readFileSync(path.join(runtimeRoot, OPEN_COMPUTER_USE_MARKER), 'utf8'));
  const expected = {
    commit: OPEN_COMPUTER_USE_COMMIT,
    upstreamCommit: OPEN_COMPUTER_USE_UPSTREAM_COMMIT,
    version: OPEN_COMPUTER_USE_VERSION,
    platform: targetPlatform,
    arch: normalizeArch(targetArch),
  };
  for (const [name, value] of Object.entries(expected)) {
    if (marker[name] !== value) {
      throw new Error(`Open Computer Use runtime marker ${name} is ${marker[name] ?? '<missing>'}; expected ${value}`);
    }
  }
  if (options.sourceDigest && marker.sourceDigest !== options.sourceDigest) {
    throw new Error('Open Computer Use runtime was built from stale checkout contents');
  }
  if (targetPlatform !== 'win32') {
    try {
      fs.accessSync(entryPath, fs.constants.X_OK);
    } catch {
      throw new Error(`Open Computer Use runtime is not executable: ${entryPath}`);
    }
  }
  return { checked: required, entryPath, marker };
}

function prepareOpenComputerUseRuntime(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const runtimeRoot = options.runtimeRoot ?? path.join(repositoryRoot, '.data', 'open-computer-use-runtime');
  const targetPlatform = options.targetPlatform ?? process.platform;
  const targetArch = options.targetArch ?? process.arch;
  assertNativeBuildTarget(targetPlatform, targetArch);
  const source = inspectOpenComputerUseCheckout({
    repositoryRoot,
    checkout: options.checkout,
    runGit: options.runGit,
  });

  try {
    const verified = verifyOpenComputerUseRuntime({
      runtimeRoot,
      targetPlatform,
      targetArch,
      sourceDigest: source.sourceDigest,
    });
    return { ...source, ...verified, runtimeRoot, reused: true };
  } catch {
    // A missing, incomplete, wrong-target, or stale runtime is rebuilt below.
  }

  const run =
    options.run ??
    ((command, args, cwd, env = {}) =>
      execFileSync(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: 'inherit',
      }));
  const runCapture =
    options.runCapture ??
    ((command, args, cwd, env = {}) =>
      execFileSync(command, args, {
        cwd,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
  fs.mkdirSync(path.dirname(runtimeRoot), { recursive: true });
  const stagingRoot = fs.mkdtempSync(path.join(path.dirname(runtimeRoot), '.open-computer-use-runtime-'));

  try {
    if (targetPlatform === 'darwin') {
      assertMacOSVersion(runCapture);
      const swiftCache = path.join(repositoryRoot, '.data', 'open-computer-use-swift-cache');
      fs.mkdirSync(swiftCache, { recursive: true });
      const swiftPath = runCapture('xcrun', ['--find', 'swift']).trim();
      const swiftEnvironment = {
        CLANG_MODULE_CACHE_PATH: path.join(swiftCache, 'clang'),
        SWIFTPM_MODULECACHE_OVERRIDE: path.join(swiftCache, 'swiftpm'),
      };
      run(
        swiftPath,
        ['build', '--disable-sandbox', '-c', 'release', '--product', 'OpenComputerUse'],
        source.checkout,
        swiftEnvironment
      );
      const binaryDirectory = runCapture(
        swiftPath,
        ['build', '--disable-sandbox', '-c', 'release', '--show-bin-path'],
        source.checkout,
        swiftEnvironment
      ).trim();
      const appRoot = path.join(stagingRoot, 'Open Computer Use.app');
      const contents = path.join(appRoot, 'Contents');
      const executableDirectory = path.join(contents, 'MacOS');
      const resources = path.join(contents, 'Resources');
      fs.mkdirSync(executableDirectory, { recursive: true });
      fs.mkdirSync(resources, { recursive: true });
      fs.copyFileSync(path.join(binaryDirectory, 'OpenComputerUse'), path.join(executableDirectory, 'OpenComputerUse'));
      fs.chmodSync(path.join(executableDirectory, 'OpenComputerUse'), 0o755);
      fs.copyFileSync(
        path.join(
          source.checkout,
          'docs/references/codex-computer-use-reverse-engineering/assets/extracted-2026-04-19/official-software-cursor-window-252.png'
        ),
        path.join(resources, 'official-software-cursor-window-252.png')
      );
      fs.writeFileSync(
        path.join(contents, 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleExecutable</key><string>OpenComputerUse</string>
<key>CFBundleIdentifier</key><string>com.ifuryst.opencomputeruse</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>Open Computer Use</string>
<key>CFBundleDisplayName</key><string>Open Computer Use</string>
<key>OpenComputerUseAppVariant</key><string>release</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${OPEN_COMPUTER_USE_VERSION}</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
`
      );
      run('plutil', ['-lint', path.join(contents, 'Info.plist')], source.checkout);
      run('codesign', ['--force', '--deep', '--sign', '-', appRoot], source.checkout);
    } else {
      const goArch = normalizeArch(targetArch) === 'x64' ? 'amd64' : 'arm64';
      const moduleName = targetPlatform === 'linux' ? 'OpenComputerUseLinux' : 'OpenComputerUseWindows';
      const outputPath = path.join(stagingRoot, runtimeEntryRelativePath(targetPlatform));
      run(
        'go',
        ['build', '-trimpath', '-ldflags', `-s -w -X main.version=${OPEN_COMPUTER_USE_VERSION}`, '-o', outputPath, '.'],
        path.join(source.checkout, 'apps', moduleName),
        { CGO_ENABLED: '0', GOARCH: goArch, GOOS: targetPlatform === 'win32' ? 'windows' : 'linux' }
      );
    }

    fs.copyFileSync(path.join(source.checkout, 'LICENSE'), path.join(stagingRoot, 'LICENSE'));
    fs.writeFileSync(
      path.join(stagingRoot, OPEN_COMPUTER_USE_MARKER),
      `${JSON.stringify(
        {
          commit: source.commit,
          upstreamCommit: source.upstreamCommit,
          version: source.version,
          sourceDigest: source.sourceDigest,
          platform: targetPlatform,
          arch: normalizeArch(targetArch),
        },
        null,
        2
      )}\n`
    );
    const staged = verifyOpenComputerUseRuntime({
      runtimeRoot: stagingRoot,
      targetPlatform,
      targetArch,
      sourceDigest: source.sourceDigest,
    });
    const reportedVersion = runCapture(staged.entryPath, ['--version'], stagingRoot).trim();
    if (reportedVersion !== OPEN_COMPUTER_USE_VERSION) {
      throw new Error(
        `Open Computer Use runtime reports ${reportedVersion || '<empty>'}; expected ${OPEN_COMPUTER_USE_VERSION}`
      );
    }

    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.renameSync(stagingRoot, runtimeRoot);
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  const verified = verifyOpenComputerUseRuntime({
    runtimeRoot,
    targetPlatform,
    targetArch,
    sourceDigest: source.sourceDigest,
  });
  return { ...source, ...verified, runtimeRoot, reused: false };
}

function runDoctor(entryPath) {
  const result = spawnSync(entryPath, ['doctor'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Open Computer Use doctor exited with status ${result.status ?? 'unknown'}`);
}

if (require.main === module) {
  const verifyOnly = process.argv.includes('--verify-only');
  const doctor = process.argv.includes('--doctor');
  const result = verifyOnly ? inspectOpenComputerUseCheckout() : prepareOpenComputerUseRuntime();
  console.log(`Open Computer Use ${result.version} pinned at ${result.commit}`);
  if (doctor) runDoctor(result.entryPath);
}

module.exports = {
  OPEN_COMPUTER_USE_COMMIT,
  OPEN_COMPUTER_USE_MARKER,
  OPEN_COMPUTER_USE_ORIGIN,
  OPEN_COMPUTER_USE_UPSTREAM,
  OPEN_COMPUTER_USE_UPSTREAM_COMMIT,
  OPEN_COMPUTER_USE_VERSION,
  assertMacOSVersion,
  assertNativeBuildTarget,
  hashBuildInputs,
  inspectOpenComputerUseCheckout,
  normalizeArch,
  normalizeRemote,
  prepareOpenComputerUseRuntime,
  runtimeEntryRelativePath,
  runDoctor,
  verifyOpenComputerUseRuntime,
};
