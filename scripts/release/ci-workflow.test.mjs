import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
test('release credentials and publication are unavailable to pull-request workflows', () => {
  assert.doesNotMatch(workflow, /pull_request|workflow_run|secrets:\s*inherit/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?publish:[\s\S]*?default: false/);
  assert.match(workflow, /publish:\n\s+needs: \[preflight, desktop, images\]\n\s+if: needs\.preflight\.outputs\.publish == 'true'/);
  assert.match(workflow, /group: official-release-publication\n\s+cancel-in-progress: false/);
  assert.match(workflow, /Remove temporary signing material\n\s+if: always\(\)/);
  for (const line of workflow.split('\n').filter((line) => /uses:/.test(line))) {
    if (line.includes('./.github/workflows/')) continue;
    assert.match(line, /@[a-f0-9]{40}(?:\s|$)/, 'Every external action must be pinned to a commit');
  }
  // Only the allowlisted staging directory may be uploaded, never the checkout or keychain directory.
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/release-installers\/\*/);
  assert.doesNotMatch(workflow, /path:.*(?:ellmsha-signing|source-manifest|github\.workspace)/);
});

test('desktop packaging has a bounded heap inherited by its Node subprocesses', () => {
  const desktop = workflow.split('\n  desktop:\n')[1].split('\n  images:\n')[0];
  assert.match(desktop, /\n    env:\n[\s\S]*?NODE_OPTIONS: '--max-old-space-size=4096'/);
  assert.match(desktop, /CARGO_BUILD_JOBS: '2'/);
});

test('signed verification wires the same signing lifecycle without enabling publication', () => {
  assert.doesNotMatch(workflow, /sign_macos|WINDOWS_SIGNING_ENABLED|WINDOWS_CERTIFICATE|WIN_CSC|Authenticode/);
  assert.match(workflow, /preflight:\n\s+runs-on: ubuntu-24.04\n\s+environment: release/);
  assert.match(workflow, /REQUIRE_SIGNING_SECRETS: 'true'/);
  const readiness = workflow.match(/MAC_SIGNING_READY: (.+)/)[1];
  for (const secret of ['MAC_CERTIFICATE_P12_BASE64', 'MAC_CERTIFICATE_PASSWORD', 'MAC_SIGNING_IDENTITY', 'MAC_TEAM_ID', 'MAC_NOTARY_APPLE_ID', 'MAC_NOTARY_APP_PASSWORD']) assert.ok(readiness.includes(`secrets.${secret} != ''`));
  assert.match(workflow, /target: mac-arm64\n\s+signing: signed \+ notarized\n\s+environment: release/);
  assert.match(workflow, /target: win-x64\n\s+signing: unsigned\n\s+environment: ci/);
  assert.match(workflow, /name: \$\{\{ matrix.target \}\} \(\$\{\{ matrix.signing \}\}; \$\{\{ needs.preflight.outputs.publish == 'true' && 'release' \|\| 'verification' \}\}\)/);
  assert.match(workflow, /Prepare ephemeral Developer ID keychain and notarization\n\s+if: runner.os == 'macOS'\n/);
  const macBuild = workflow.split('name: Build macOS installers\n')[1].split('\n      - ')[0];
  assert.match(macBuild, /node scripts\/release\/build.mjs --signed\n\s+xcrun stapler validate[^\n]+\n\s+spctl --assess/);
  assert.doesNotMatch(macBuild, /publish|--unsigned/);
  const winBuild = workflow.split('name: Build Windows x86_64 installer\n')[1].split('\n      - ')[0];
  assert.match(winBuild, /node scripts\/release\/build.mjs --unsigned/);
  assert.doesNotMatch(winBuild, /secrets\.|--signed/);
  assert.match(workflow, /Remove temporary signing material\n\s+if: always\(\) && runner.os == 'macOS'\n/);
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
});
