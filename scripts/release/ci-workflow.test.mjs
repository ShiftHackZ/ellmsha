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
