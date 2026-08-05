# CartaVault container releases

CartaVault publishes one application image to GitHub Container Registry. The
standard deployment combines that image with the digest-pinned official
PostGIS image from `docker/compose.portainer.yml`.

## Published image contract

```text
Registry     ghcr.io
Repository   flynx9/cartavault
Platform     linux/amd64
Version      semantic version without the leading v
Example      ghcr.io/flynx9/cartavault:0.9.0-beta.1
```

Every immutable version tag identifies one released Git commit. Pre-releases
also update the mutable `beta` alias; stable releases update `latest`. Never
use a mutable alias as the only rollback reference.

The image contains FastAPI, Alembic and the compiled React frontend. It runs as
the non-root `cartavault` user and does not contain the Python test runner. Base
images are pinned by digest. No deployment secret or provider key is supplied
to the build.

## Automated publication

`.github/workflows/release-container.yml` runs when a GitHub Release is
published. It rejects malformed tags, releases outside the `master` history
and commits without a successful `CI` push run. The workflow then:

1. builds an AMD64 candidate from `docker/Dockerfile`;
2. checks the runtime user, version metadata and production dependencies;
3. blocks fixable critical vulnerabilities with Trivy;
4. rebuilds from the same pinned inputs and BuildKit cache;
5. pushes immutable, channel and commit-SHA tags to GHCR;
6. attaches an SBOM, maximum BuildKit provenance and a GitHub attestation.

Actions are pinned to full commit SHAs and publication uses the scoped
repository `GITHUB_TOKEN`; no long-lived registry password is required.

## Maintainer release procedure

Start only from a clean `master` revision whose push CI completed
successfully. For the first public beta:

```powershell
git switch master
git pull --ff-only
git status --short
git tag -a v0.9.0-beta.1 -m "CartaVault 0.9.0 beta 1"
git push origin v0.9.0-beta.1
gh release create v0.9.0-beta.1 --prerelease --generate-notes --verify-tag
```

Publishing the release starts the container workflow. If it fails, fix the
cause and publish a new version; do not move or overwrite an immutable release
tag that users may already have pulled.

## Verify a published release

```powershell
docker pull ghcr.io/flynx9/cartavault:0.9.0-beta.1
docker buildx imagetools inspect ghcr.io/flynx9/cartavault:0.9.0-beta.1
gh attestation verify `
  oci://ghcr.io/flynx9/cartavault:0.9.0-beta.1 `
  --repo FlynX9/CartaVault
```

Record the resolved `sha256` digest in operational change notes. A deployment
may pin the digest in addition to the version tag when strict immutability is
required.

## Portainer deployment

Use `docker/compose.portainer.yml` and define at least:

```env
CARTAVAULT_IMAGE=ghcr.io/flynx9/cartavault
CARTAVAULT_VERSION=0.9.0-beta.1
```

The package is public, so Portainer does not need registry credentials. Before
an upgrade, back up PostgreSQL, photos, avatars and
`CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` as one recovery set. Redeploy with
"Pull latest image" enabled, then validate `/healthz`, login, one map, one
media file and one safe write.

## Rollback

Keep the previous version tag and complete pre-upgrade backup. To roll the
application image back, restore the previous `CARTAVAULT_VERSION` and redeploy.
If the newer release applied a schema migration that is not backward
compatible, restore the complete matching database and media backup instead
of starting the old image against the newer schema.
