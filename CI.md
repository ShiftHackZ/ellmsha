# Building eLLMsha with GitHub Actions

Use the root repository's **Release installers and VPS images** workflow for development builds as well as releases. A development build produces downloadable run artifacts. A release publishes installers to GitHub Releases and images to GHCR.

## Build just what you need

1. Open [the build workflow](https://github.com/ShiftHackZ/ellmsha/actions/workflows/release.yml) and choose **Run workflow**.
2. Select the branch to build. Use `develop` for the integration build or select your pushed feature branch to test its exact source. The selected ref must contain this workflow version.
3. Enable the outputs you want in the table below. All six default to **on**. Leave **publish** off.
4. Open the finished run and download the matching archive under **Artifacts**. Desktop archives include the installer, SHA-256 sums and a JSON manifest with the root and component commits. Run artifacts are retained for 14 days.

| Input | Output |
| --- | --- |
| `macos` | Apple silicon DMG and ZIP. Main and release tags use Developer ID signing and notarization. Development branches produce unsigned installers. |
| `windows` | Unsigned Windows x64 installer |
| `linux-flatpak` | Linux x64 Flatpak bundle |
| `linux-deb` | Linux x64 Debian package |
| `linux-appimage` | Linux x64 portable AppImage, packaged inside a pinned Node container |
| `docker` | Four Linux/amd64 VPS images and their smoke checks |

The three Linux switches are independent of each other and of `docker`. A combined Linux build compiles the desktop payload once. Only Flatpak requests install the Flatpak SDK. The AppImage container wraps the unpacked application and reuses the electron-builder download cache.

For example, this builds **only AppImage** on a pushed feature branch:

```sh
gh workflow run release.yml --repo ShiftHackZ/ellmsha --ref feature/my-change \
  -f macos=false -f windows=false -f docker=false \
  -f linux-flatpak=false -f linux-deb=false -f linux-appimage=true -f publish=false
```

To test Flatpak alone, swap the Flatpak and AppImage values. Use `gh run list --repo ShiftHackZ/ellmsha --workflow release.yml --branch feature/my-change` to find the run.

## What runs on a pull request

Every root PR targeting `develop` or `main` runs release contracts, desktop UI tests and Rust workspace library tests against the PR merge result and its pinned submodules. Changes to the shared-terminal paths also trigger the existing cross-platform PTY suite. PR jobs use read-only repository permissions. Packaging is available separately through manual dispatch.

Desktop builds cache compiled Rust dependencies, package-manager downloads, Electron and electron-builder downloads, and the Flatpak installation when selected. Docker maintains its own build cache. GitHub scopes cache reuse by ref. A cache miss on a new branch is expected. Inspect the earliest failed step and retry failed jobs after resolving transient runner issues.

## Publish a release

1. Validate the desired root and component commits on `main`. Build the candidate with **publish off** and test its installers.
2. Check the release notes and the package/About version. Push the matching immutable `vYYYY.MM.DD-patch.N` tag at that exact commit. The tag push selects **all six outputs** and starts publication automatically.
3. Let that run finish. Its publish job checks the exact tag, Kyiv release date, source manifests, installer hashes and tested images before publishing. Verify the distributed assets from the [release page](https://github.com/ShiftHackZ/ellmsha/releases) because publication rebuilds them.

Manual publication is reserved for the exact tagged commit on main or the matching tag and requires all six outputs. Avoid dispatching a second publication for a tag that already triggered a run. Configure GitHub's **release** environment deployment restrictions for `main` and release tags and keep signing secrets in that environment. See [signing and build prerequisites](scripts/release/README.md) and [branching strategy](GIT.md).
