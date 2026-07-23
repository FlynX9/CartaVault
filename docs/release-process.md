# Versioning and release process

This document describes CartaVault's versioning strategy and the recommended release procedure.

## Versioning strategy

CartaVault uses Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Before `1.0.0`, use the following convention:

- `0.MINOR.0`: significant feature, architecture evolution, or potentially breaking change;
- `0.MINOR.PATCH`: bug fix, compatible improvement, documentation, or maintenance;
- `1.0.0`: first release considered stable.

Examples:

```text
0.1.0  First public development release
0.1.1  Fixes without a material behavior change
0.2.0  Significant feature or breaking evolution
1.0.0  First stable release
```

## Breaking changes

Every breaking change must be called out in:

- `CHANGELOG.md`;
- the GitHub release notes;
- the related pull request;
- migration documentation when appropriate.

Examples include changing an import/export format, removing or renaming an environment variable, changing API or permission behavior, introducing a non-reversible migration, changing photo storage, or changing encryption keys or mechanisms.

## Preparing a release

### 1. Choose the version

Select the next version number based on the nature of the changes.

```text
0.1.0 → 0.1.1 for fixes
0.1.1 → 0.2.0 for a significant evolution
```

### 2. Update the main branch

```bash
git checkout master
git pull --ff-only
```

### 3. Create a release branch

```bash
git checkout -b release/0.1.0
```

### 4. Update the changelog

In `CHANGELOG.md`:

1. move relevant entries from `[Unreleased]` to a new version section;
2. add the date in `YYYY-MM-DD` format;
3. reset the `[Unreleased]` sections;
4. verify the comparison links at the end of the file.

```markdown
## [0.1.0] - 2026-07-20
```

### 5. Verify migrations

From `backend`:

```bash
python -m alembic current
python -m alembic check
```

On a clean test database only:

```bash
python -m alembic upgrade head
```

When rollback is supported:

```bash
python -m alembic downgrade -1
python -m alembic upgrade head
```

Never test a destructive downgrade on a database containing important data.

### 6. Run backend verification

```bash
python -m compileall app migrations tests
python -m pytest -m unit -v
python -m pytest -m integration -v
python -m pytest -v
python -m alembic heads
python -m alembic check
python -c "from app.main import app; print(app.title)"
```

Document every test that was not run.

### 7. Run frontend verification

```bash
npm ci
npm run verify:category-icons
npm run lint
npm run test
npm run build
```

### 8. Run the manual checklist

Follow [`manual-test-checklist.md`](manual-test-checklist.md). At minimum, validate authentication, maps, places, import/export, permissions, trips, responsive behavior, light and dark themes, and the primary workflows in the supported browsers.

### 9. Verify documentation

Review the root, backend, frontend, and test READMEs, deployment notes, migration notes, the changelog, and screenshots when the UI changed.

### 10. Verify secrets

Before publishing, confirm that no `.env` file, credential, token, password, connection string, user data, generated upload, local storage artifact, or test cache is tracked.

## Create the release commit

```bash
git status
git diff --check
git add CHANGELOG.md README.md backend/README.md frontend/README.md docs/
git commit -m "chore(release): prepare v0.1.0"
```

## Create the tag

```bash
git tag -a v0.1.0 -m "CartaVault v0.1.0"
git push origin release/0.1.0 --follow-tags
```

## Create the GitHub release

Create the release from `v0.1.0`, use the changelog as the source of truth, identify migrations and deployment requirements, and mark a pre-release clearly when it is not stable.

## Update procedure

1. Back up the database and persistent storage.
2. Read the release notes and migration notes.
3. Update the application code and dependencies.
4. Apply migrations only after verifying the target database.
5. Restart the backend and frontend.
6. Validate health endpoints, login, maps, and one safe write workflow.

## Rollback

### Application only

Redeploy the previous compatible application version and keep the database schema unchanged whenever possible.

### Database

Run Alembic downgrade only when the migration explicitly documents a safe rollback. Restore the verified backup instead when the migration is destructive or data was transformed irreversibly.

### Secrets and encryption

Never roll back or replace an encryption key casually. Keep the previous master key available until every encrypted value has been migrated or removed. Restore credentials from a secure backup rather than exposing them in logs or Git.

## Patch release

For a focused correction, branch from the supported release line, include regression coverage, run the full relevant verification suite, and publish a new patch tag such as `v0.1.1`.

## Cancel a GitHub release

If a release was published by mistake, mark it as a draft or pre-release where appropriate, communicate the issue, and publish a corrective release. Do not rewrite tags that may already have been pulled by users.

## Condensed checklist

- [ ] Version selected and changelog updated.
- [ ] `git diff --check` passes.
- [ ] Backend tests and Alembic checks pass on the test database.
- [ ] Frontend lint, tests, and build pass.
- [ ] Manual checklist completed.
- [ ] Documentation and screenshots updated.
- [ ] Secrets and generated artifacts excluded.
- [ ] Backups verified before production migrations.
- [ ] Release commit, tag, and release notes prepared.
