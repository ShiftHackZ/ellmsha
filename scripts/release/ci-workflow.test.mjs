import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
const imageWorkflow = readFileSync(new URL('../../.github/workflows/docker-images.yml', import.meta.url), 'utf8');
test('release credentials and publication are unavailable to pull-request workflows', () => {
  assert.doesNotMatch(workflow, /pull_request|workflow_run|secrets:\s*inherit/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?publish:[\s\S]*?default: false/);
  assert.match(workflow, /publish:\n\s+needs: \[preflight, desktop, images\]\n\s+if: needs\.preflight\.outputs\.publish == 'true'/);
  assert.match(workflow, /group: official-release-publication\n\s+cancel-in-progress: false/);
  assert.match(workflow, /Remove temporary signing material\n\s+if: always\(\)/);
  for (const line of workflow.split('\n').filter((line) => /uses:/.test(line))) {
    if (line.includes('./.github/')) continue;
    assert.match(line, /@[a-f0-9]{40}(?:\s|$)/, 'Every external action must be pinned to a commit');
  }
  // Only the allowlisted staging directory may be uploaded, never the checkout or keychain directory.
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/release-installers\/\*/);
  assert.doesNotMatch(workflow, /path:.*(?:ellmsha-signing|source-manifest|github\.workspace)/);
});

test('locked desktop installation provides the native build tool and checks SQLite startup', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../aionui/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.devDependencies['node-gyp'], '12.4.0');
  const install = workflow.split('name: Install locked dependencies\n')[1].split('\n      - ')[0];
  assert.match(install, /uses: \.\/.github\/actions\/install-desktop-dependencies/);
  const action = readFileSync(new URL('../../.github/actions/install-desktop-dependencies/action.yml', import.meta.url), 'utf8');
  assert.match(action, /if: runner.os == 'Windows'[\s\S]*npm install --global node-gyp@12\.4\.0/);
  assert.match(action, /bun install --frozen-lockfile/);
  assert.doesNotMatch(action, /--ignore-scripts/);
  assert.match(action, /require\('better-sqlite3'\)/);
  assert.match(action, /new Database\(':memory:'\)/);
  assert.match(action, /SELECT 1 AS ok/);
});

test('desktop packaging has a bounded heap inherited by its Node subprocesses', () => {
  const desktop = workflow.split('\n  desktop:\n')[1].split('\n  images:\n')[0];
  assert.match(desktop, /\n    env:\n[\s\S]*?NODE_OPTIONS: '--max-old-space-size=4096'/);
  assert.match(desktop, /CARGO_BUILD_JOBS: '2'/);
});

test('signed verification wires the same signing lifecycle without enabling publication', () => {
  assert.doesNotMatch(workflow, /sign_macos|WINDOWS_SIGNING_ENABLED|WINDOWS_CERTIFICATE|WIN_CSC|Authenticode/);
  assert.ok(workflow.includes("environment: ${{ (github.event_name == 'push' || inputs.macos) && 'release' || 'ci' }}"));
  assert.doesNotMatch(workflow, /Build unsigned macOS|signed on main and release tags/);
  assert.match(workflow, /REQUIRE_SIGNING_SECRETS: 'true'/);
  const readiness = workflow.match(/MAC_SIGNING_READY: (.+)/)[1];
  for (const secret of ['MAC_CERTIFICATE_P12_BASE64', 'MAC_CERTIFICATE_PASSWORD', 'MAC_SIGNING_IDENTITY', 'MAC_TEAM_ID', 'MAC_NOTARY_APPLE_ID', 'MAC_NOTARY_APP_PASSWORD']) assert.ok(readiness.includes(`secrets.${secret} != ''`));
  assert.match(workflow, /matrix: \$\{\{ fromJSON\(needs.preflight.outputs.desktop_matrix\) \}\}/);
  assert.match(workflow, /name: \$\{\{ matrix.target \}\} \(\$\{\{ matrix.signing \}\}; \$\{\{ needs.preflight.outputs.publish == 'true' && 'release' \|\| 'verification' \}\}\)/);
  assert.match(workflow, /Prepare ephemeral Developer ID keychain and notarization\n\s+if: runner.os == 'macOS' && matrix.environment == 'release'\n/);
  const macBuild = workflow.split('name: Build macOS installers\n')[1].split('\n      - ')[0];
  assert.match(macBuild, /node scripts\/release\/build.mjs --signed\n\s+node scripts\/release\/ci-macos-signing.mjs validate[^\n]+\n\s+spctl --assess/);
  assert.doesNotMatch(macBuild, /publish|--unsigned/);
  const winBuild = workflow.split('name: Build Windows x86_64 installer\n')[1].split('\n      - ')[0];
  assert.match(winBuild, /node scripts\/release\/build.mjs --unsigned/);
  assert.doesNotMatch(winBuild, /secrets\.|--signed/);
  assert.match(workflow, /Remove temporary signing material\n\s+if: always\(\) && runner.os == 'macOS' && matrix.environment == 'release'\n/);
  const images = workflow.split('\n  images:\n')[1].split('\n  publish:\n')[0];
  assert.match(images, /publish: \$\{\{ needs.preflight.outputs.publish == 'true' \}\}/);
});

test('failed packaging retains the same non-secret cache paths without saving cancelled runs', () => {
  const restore = workflow.split('uses: actions/cache/restore@')[1].split('\n      - ')[0];
  const save = workflow.split('uses: actions/cache/save@')[1].split('\n      - ')[0];
  const paths = (step) => step.match(/          path: \|\n((?:            .+\n)+)/)[1];
  assert.equal(paths(save), paths(restore));
  assert.doesNotMatch(paths(save), /signing|keychain|\.p12|source-manifest|release-installers/);
  assert.match(save, /key: \$\{\{ steps\.desktop-cache\.outputs\.cache-primary-key \}\}/);
  assert.match(workflow, /Retain build cache after packaging failure\n\s+if: \$\{\{ !cancelled\(\) && steps\.desktop-cache\.outputs\.cache-primary-key != '' && steps\.desktop-cache\.outputs\.cache-hit != 'true' \}\}/);
  assert.match(restore, /restore-keys: \|[\s\S]*\n            desktop-\$\{\{ matrix.target \}\}-rust1\.95\.0-node24\.11\.0-bun1\.3\.9-\n?$/);
});

test('macOS, Windows, Linux and Docker have independent default-on dispatch flags', () => {
  for (const flag of ['macos', 'windows', 'docker']) {
    assert.match(workflow, new RegExp(`      ${flag}:\\n        description: [^\\n]+\\n        type: boolean\\n        default: true`));
    assert.ok(workflow.includes(`RELEASE_BUILD_${flag.toUpperCase()}: \${{ github.event_name == 'push' || inputs.${flag} }}`));
    assert.ok(workflow.includes(`${flag}: \${{ steps.source.outputs.${flag} }}`));
  }
  assert.match(workflow, /desktop:\n    needs: preflight\n    if: needs\.preflight\.outputs\.desktop == 'true'/);
  assert.match(workflow, /desktop_matrix: \$\{\{ steps.source.outputs.desktop_matrix \}\}/);
  for (const format of ['flatpak', 'deb', 'appimage']) {
    assert.match(workflow, new RegExp(`      linux-${format}:\\n        description: [^\\n]+\\n        type: boolean\\n        default: true`));
    assert.ok(workflow.includes(`RELEASE_LINUX_${format.toUpperCase()}: \${{ github.event_name == 'push' || inputs['linux-${format}'] }}`));
  }
  assert.match(workflow, /RELEASE_LINUX_PACKAGES: \$\{\{ needs.preflight.outputs.linux_packages \}\}/);
  assert.match(workflow, /images:\n    needs: preflight\n    if: needs\.preflight\.outputs\.docker == 'true'/);
  assert.match(workflow, /publish:\n    needs: \[preflight, desktop, images\]\n    if: needs\.preflight\.outputs\.publish == 'true'/);
});

test('release tags trigger all-platform publication; dispatch also checks full source history', () => {
  assert.match(workflow, /\n  push:\n    tags: \['v\*-patch\.\*'\]/);
  assert.match(workflow, /RELEASE_PUBLISH: \$\{\{ github.event_name == 'push' \|\| inputs.publish \}\}/);
  assert.match(workflow, /submodules: recursive\n\s+fetch-depth: 0/);
  assert.ok(workflow.indexOf('name: Verify maintained native fork source pins') < workflow.indexOf('\n  desktop:\n'));
});

test('Linux installs native tools and configured Flatpak SDKs before compiling; cached SDKs stay isolated', () => {
  const linuxDeps = workflow.split('name: Install Linux native build dependencies\n')[1].split('\n      - ')[0];
  assert.match(linuxDeps, /if: runner.os == 'Linux'/);
  assert.match(linuxDeps, /build-essential cmake pkg-config libssl-dev/);
  assert.match(linuxDeps, /if \[\[ "\$RELEASE_LINUX_PACKAGES" == all \|\| "\$RELEASE_LINUX_PACKAGES" == \*flatpak\* \]\]/);
  assert.match(linuxDeps, /flatpak flatpak-builder dbus-x11/);
  assert.match(workflow, /uses: actions\/setup-go@[^\n]+\n        if: runner.os != 'macOS'/);
  const order = ['id: flatpak-cache', 'name: Install Linux native build dependencies', 'name: Install locked dependencies', 'name: Prepare configured Flatpak runtimes and verify sandbox', 'name: Build Linux x86_64 desktop packages'];
  let previous = -1;
  for (const name of order) { const current = workflow.indexOf(name); assert.ok(current > previous, name); previous = current; }
  assert.match(workflow, /Prepare configured Flatpak runtimes and verify sandbox\n        if: runner.os == 'Linux' && \(needs.preflight.outputs.linux_packages == 'all' \|\| contains\(needs.preflight.outputs.linux_packages, 'flatpak'\)\)\n        run: dbus-run-session -- node scripts\/release\/flatpak-preflight.mjs --install/);
  assert.match(workflow, /FLATPAK_USER_DIR:'flatpak-user'/);
  const restore = workflow.split('id: flatpak-cache\n')[1].split('\n      - ')[0];
  const save = workflow.split('name: Retain Flatpak runtime cache after packaging failure\n')[1].split('\n      - ')[0];
  for (const step of [restore, save]) assert.match(step, /path: \$\{\{ runner.temp \}\}\/flatpak-user/);
  assert.match(restore, /key: flatpak-ubuntu24.04-x64-[^\n]+needs.preflight.outputs.source_ref/);
  assert.match(save, /!cancelled\(\).*steps.flatpak-cache.outputs.cache-hit != 'true'/);
  assert.match(save, /key: \$\{\{ steps.flatpak-cache.outputs.cache-primary-key \}\}/);
  const build = workflow.split('name: Build Linux x86_64 desktop packages\n')[1].split('\n      - ')[0];
  assert.match(build, /node scripts\/release\/build.mjs --unsigned/);
  assert.match(build, /if \[\[ "\$RELEASE_LINUX_PACKAGES" != all && "\$RELEASE_LINUX_PACKAGES" != \*flatpak\* \]\]; then\n\s+node scripts\/release\/build.mjs --unsigned\n\s+else\n\s+dbus-run-session -- node scripts\/release\/build.mjs --unsigned/);
});

test('parallel image builds cannot publish; tested bytes transfer only for gated full publication', () => {
  assert.match(workflow, /if: needs\.preflight\.outputs\.publish == 'true' && needs\.desktop\.result == 'success' && needs\.images\.result == 'success'/);
  assert.doesNotMatch(imageWorkflow, /packages: write|docker\/login-action|release-images\.mjs publish|push: true|secrets\./);
  assert.match(imageWorkflow, /Save tested images for gated publication\n        if: inputs\.publish\n        run: node docker\/release-images\.mjs save/);
  assert.match(imageWorkflow, /if: inputs\.publish\n        with:\n          name: \$\{\{ steps.identity.outputs.archive_artifact \}\}/);
  const publish = workflow.split('\n  publish:\n')[1];
  assert.match(publish, /name: \$\{\{ needs.images.outputs.image_archive_artifact_name \}\}\n          path: \$\{\{ runner.temp \}\}\/release-images/);
  const order = ['node scripts/release/ci-preflight.mjs', 'node scripts/release/ci-artifacts.mjs verify', 'node docker/release-images.mjs load', 'node docker/release-images.mjs validate', 'node docker/release-images.mjs publish', 'node scripts/release/ci-publish.mjs', 'node docker/promote-images.mjs'];
  let previous = -1;
  for (const command of order) { const current = publish.indexOf(command); assert.ok(current > previous, `${command} must follow its prerequisite`); previous = current; }
});


test('the container runtime includes the background terminal MCP bundle', () => {
  const docker = readFileSync(new URL('../../docker/aionui.Dockerfile', import.meta.url), 'utf8');
  assert.match(docker, /^COPY --from=frontend \/src\/aionui\/out\/main\/builtin-mcp-background-processes\.js \.\/mcp\/builtin-mcp-background-processes\.js$/m);
});

test('Docker includes the pinned managed Node layout needed by shared terminal MCP helpers', () => {
  const source=readFileSync(new URL('../../docker/aionui.Dockerfile',import.meta.url),'utf8');
  assert.match(source,/FROM node:24\.11\.0-bookworm-slim AS terminal-node/);
  assert.match(source,/COPY --from=terminal-node \/runtime\/node \.\/managed-resources\/node/);
});
