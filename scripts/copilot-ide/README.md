# Embedded desktop provider

The desktop provider implementation and lifecycle contract are documented in [PROVIDER.md](./PROVIDER.md). The instructions below describe the original standalone access probe.

# Embedded Copilot IDE experiment

Isolated feasibility probe. Not a shipped provider and not proof that a Copilot
Business subscription permits a third-party runtime. All GitHub policy denials
remain errors. No official-client identity overrides, copied credentials, private
API client, or Marketplace packages are used by the probe.

## Runtime

Build the MIT Code OSS and Copilot sources from
<https://github.com/microsoft/vscode>, pinned to
`98c0b07a5e7f9dc75960f7e2aaa96658926851b8`.
The upstream tarball SHA256 is
`186bb07dab8aa0c3d8d85e27e85a9f91a2b75f928c7546a3904cdb81a17751d3`.
Keep the source checkout and build artifacts outside tracked source, for example
under `.data/acceptance/copilot-embedded-runtime-2026-10-22/upstream`.

1. Use Node 24.22.0 as required by the pinned source's `.nvmrc`.
2. Initialize an isolated Git repository in that checkout before running upstream
   installation scripts; they write local Git configuration.
3. Apply `background.patch` with `git apply` from the source checkout.
4. Run `npm ci --no-audit --no-fund`, then `npm run build-fast`.
5. Run `npm run electron` to obtain the source build's matching Electron runtime.
   Do not use `preLaunch.ts`, which also fetches additional built-in extensions.
6. From eLLMsha's root:

   ```sh
   node scripts/copilot-ide/run.mjs --source /absolute/path/to/upstream
   ```

The process runs out of the private build directory; nothing is installed into
`/Applications`. A narrowly scoped source patch suppresses editor windows and
the Dock entry. The renderer and real extension host still run. The matching
upstream Electron runtime is an additional dependency, not a claim that eLLMsha's
current Electron ABI is interchangeable with it.
The isolated runtime profile is `.data/copilot-ide`; a short path is required
by macOS's Unix socket path limit. Keep provenance metadata named
`source-manifest.json`, not `<source-checkout>.json`: Electron can resolve the
latter as an application entry point instead of the source directory.
macOS must retain the actual user `HOME` to locate the existing login Keychain.
Isolation uses `--user-data-dir`, `--shared-data-dir`, `--extensions-dir`, and the
upstream-supported `COPILOT_HOME` override instead. Never reset the system
Keychain or use plaintext password storage to work around an authentication issue.

For initial GitHub authentication only, use `--interactive` and invoke
**eLLMsha: Sign in to GitHub for Copilot Probe** from the command palette, followed
by **eLLMsha: Probe Copilot IDE Access**. The sign-in command requests only
`user:email`, matching Copilot's minimum scope exactly; it does not request
repository access. A combined scope session is not a substitute for this
scope-specific session lookup. That opt-in mode
shows the isolated Code OSS setup window. The background mode does not silently
create a GitHub authentication session. Never import another application's token
or relax organization settings to make the experiment pass.

## Acceptance

`probe.cjs` uses public `vscode.lm` APIs to enumerate models, stream a harmless
marker, request one echo tool call, and return its result to the model. It never
executes model-provided tools. The sanitized report lives beside the checkout;
provider errors store only error name/code, not token-bearing error messages.
There is no model usage counter exposed by this probe, so usage must not be
reported as zero.

`pass` requires **real Copilot** text and tool roundtrip success. No models,
authorization denial, a missing runtime, or an incomplete build is not a pass.
The probe does not yet expose an HTTP provider, run an eLLMsha agent task, or
establish licensing/organization approval for redistribution. See PROVIDER.md for the implementation and its separate acceptance evidence.

### Observed result — 2026-10-22

The isolated native Code OSS runtime authenticated with GitHub and exposed 26
Copilot model entries (including auto and utility entries). A real request to
`claude-haiku-5.5` passed both the exact text-marker check and the required echo
tool call/result roundtrip through public `vscode.lm`. This proves access for
that tested model; catalog enumeration alone does not prove every model works.
Production eLLMsha was not modified. Provider integration and full agent-task
acceptance remain pending.
