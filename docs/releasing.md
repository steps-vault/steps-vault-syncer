# Releasing StepsVault Sync

Releases are built in public GitHub Actions (`.github/workflows/release.yml`), signed through SignPath's free plan for
open-source projects, and published as GitHub releases. The app updates itself from those releases.

## Make a release

1. Set the new version in `apps/desktop/package.json` (for example `0.2.0`) and merge that to `main`.
2. Tag it: `git tag v0.2.0 && git push origin v0.2.0`. The tag must match the version, or the workflow stops.
3. The workflow:
   - checks, tests and packages the app;
   - has SignPath sign every program inside it;
   - builds the installer from the signed app;
   - has SignPath sign the installer;
   - updates `latest.yml` for the signed file;
   - publishes the installer, `latest.yml` and `SHA256SUMS.txt`.
4. Every installed copy finds the update within 6 hours, downloads it quietly, and shows "Restart to update".

Without SignPath, the workflow still builds a **test** installer (an artifact named `test-build-unsigned`, kept for 7
days) but publishes nothing. Unsigned builds are blocked or warned about by Windows, so they are never released.

## Set up SignPath (once)

1. Apply at https://signpath.org for this repo (issue #14). SignPath needs an OSI licence (Apache-2.0), a public repo
   and builds in public CI, all of which are in place.
2. In SignPath, create the project with two artifact configurations:
   - `app-folder`: a zip of the app folder; sign every `.exe` and `.dll` inside it (deep signing);
   - `installer`: a zip holding the installer `.exe`; sign that file.
3. Link the project to this repo as a "trusted build system" (GitHub Actions), and create a signing policy.
4. In this repo's Settings → Secrets and variables → Actions, add:
   - the secret `SIGNPATH_API_TOKEN`;
   - the variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_SIGNING_POLICY_SLUG`.

## Known gaps

- **The uninstaller is not signed.** NSIS makes it while building the installer, so it can't go through SignPath
  before the installer is assembled. Windows may warn when the app is uninstalled.
- **The installer is about 110 MB**, mostly the Chromium runtime that Electron ships.
