# Versioning and release process

CartaVault uses Semantic Versioning (`MAJOR.MINOR.PATCH`). The current stable
release is `1.0.0`; release tags have a leading `v`, for example `v1.0.0`.
Use a SemVer pre-release suffix only when publishing a GitHub Release marked as
a pre-release.

## Release preparation

1. Select the next SemVer version and update `CHANGELOG.md`, release notes,
   deployment examples, and package metadata when they carry the release
   version. Preserve historical changelog entries and their version numbers.
2. Prepare the release commit on `master`. The container publication workflow
   accepts only a released commit that is contained in `master`; it does not
   use release branches.
3. Wait for the `CI` push run for that exact commit to complete successfully.
   It compiles Python sources, applies and checks Alembic migrations, runs the
   backend suite, verifies frontend category icons, lints, tests, builds, and
   checks the frontend bundle budget. It also validates Compose contracts,
   performs container smoke tests, and runs secret detection.
4. Run the release-specific checks that CI does not currently enforce,
   including the website generated-documentation check:

   ```powershell
   Set-Location website
   npm run docs:check
   ```

   The current `CI` workflow does not run `docs:check`; do not treat a
   successful CI run as proof that generated documentation is current.
5. Complete [`manual-test-checklist.md`](manual-test-checklist.md), review the
   deployment and rollback notes, and verify that no secret or generated local
   artifact is tracked.

## Bundle budget

`CI` runs `npm run check:bundle` after the frontend build. The configured
initial JavaScript budget is 1,050,000 bytes; a release must satisfy that check.
Do not raise or remove the budget solely to publish a release. The documented
performance baseline currently exceeds the configured budget, so this is a
separate release-policy blocker until the bundle or an explicitly justified
budget policy is corrected.

## Publish the GitHub Release

Create a GitHub Release for the selected tag, such as `v1.0.0`, targeted at the
validated `master` commit. Use `CHANGELOG.md` and the release notes as the
source of truth, identify migration and deployment requirements, and set the
pre-release flag only for a pre-release version.

Publishing that GitHub Release triggers
`.github/workflows/release-container.yml`. The workflow rejects malformed tags,
commits outside `master`, and commits without a successful `CI` push run. It
then builds and verifies the image, blocks fixable critical vulnerabilities,
publishes it to GHCR, and attaches an SBOM, BuildKit provenance, and a GitHub
attestation.

The exact version tag is immutable. A pre-release also receives the mutable
`beta` alias; a stable release receives the mutable `latest` alias. The
workflow also publishes a commit-SHA tag. Do not use `beta` or `latest` as the
only rollback reference and never move a release tag users may have pulled.

## Verify the published image

For a stable `1.0.0` release:

```powershell
docker pull ghcr.io/flynx9/cartavault:1.0.0
docker buildx imagetools inspect ghcr.io/flynx9/cartavault:1.0.0
gh attestation verify `
  oci://ghcr.io/flynx9/cartavault:1.0.0 `
  --repo FlynX9/CartaVault
```

Record the resolved image digest in operational change notes. Before deployment,
verify an off-host backup; deploy only the immutable version tag or digest;
then verify readiness, login, a map, media, and a safe write. See
[`container-releases.md`](container-releases.md) and
[`backup-and-restore.md`](backup-and-restore.md).

## Rollback

Redeploy the previous immutable application version only when its schema is
compatible. For an incompatible schema change, restore the matching verified
database/media recovery set instead of performing an automatic Alembic
downgrade. Keep encryption keys available; do not replace them casually.
