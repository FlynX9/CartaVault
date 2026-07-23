# Dependency update policy

CartaVault receives automated dependency updates via
[Dependabot](https://docs.github.com/en/code-security/dependabot).

## Scope

| Ecosystem | Path | Cadence | Notes |
|-----------|------|---------|-------|
| npm | `/frontend` | weekly (Monday) | Minor/patch grouped |
| pip | `/backend` | weekly (Monday) | Minor/patch grouped |
| GitHub Actions | `/` | weekly (Monday) | Grouped |
| Docker Compose | `/` | monthly | Images in `docker-compose.yml` |

## Rules

1. **CI must pass** before any Dependabot PR is merged.
2. **Open PR limit** is capped (5 for app ecosystems, 3 for Docker Compose) to keep the queue reviewable.
3. **Minor and patch** version updates are grouped per ecosystem to reduce noise.
4. **Major upgrades** stay ungrouped so they get individual review.
5. **Temporary ignores** go in `.github/dependabot.yml` using supported fields only (`dependency-name`, `versions`, `update-types`). Put the tracking issue in a YAML comment above the entry. Remove the ignore when the blocker is fixed.
6. Prefer **security updates** promptly; do not leave high/critical GHSA PRs open more than a few days without a documented exception.

## Review checklist for Dependabot PRs

- [ ] CI green
- [ ] Changelog / release notes skimmed for breaking changes
- [ ] App still boots locally if the change touches runtime deps
- [ ] No secrets or lockfile corruption in the diff
