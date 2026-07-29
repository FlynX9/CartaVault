# Dependency security checks

CartaVault audits both dependency manifests in GitHub Actions. The
`Dependency audit` workflow runs for pull requests, every Monday, and on
manual dispatch.

## Failure policy

- Frontend: `npm audit` scans the committed `package-lock.json`. Confirmed
  **high** or **critical** vulnerabilities fail the workflow. Low and moderate
  findings remain visible in the report but do not block a pull request.
- Backend: `pip-audit` scans every pinned entry in
  `backend/requirements.txt`. Any confirmed Python advisory fails the
  workflow because Python advisory severity is not consistently available.
- A malformed response, registry outage, OSV outage, or audit-tool failure
  also fails the workflow, but the classifier reports it as an unavailable
  audit instead of a confirmed vulnerability.
- Audit output must never contain registry credentials, private package
  tokens, application secrets, or production environment values.

## Local reproduction

Frontend:

```powershell
npm.cmd ci --prefix frontend --ignore-scripts
npm.cmd audit --prefix frontend --audit-level=high
```

Backend:

```powershell
python -m pip install --requirement backend/requirements-audit.txt
python -m pip_audit --requirement backend/requirements.txt --progress-spinner off --strict
```

Both commands require access to their public advisory and package registries.
A network failure is not evidence that the dependencies are safe.

## Temporary exceptions

An exception is allowed only when no safe upgrade or mitigation is available.
It must be narrowly scoped to one advisory identifier in
`security/dependency-audit-exceptions.json`. The classifiers reject incomplete
or expired entries.

| Advisory | Ecosystem | Owner | Rationale | Mitigation | Expiry |
| --- | --- | --- | --- | --- | --- |
| `GHSA-qwww-vcr4-c8h2` | npm | `@FlynX9` | The issue affects unstable React Router RSC APIs, which CartaVault does not use. The patched `8.3.0` release is not currently published on npm. | CartaVault remains on the client-side SPA APIs. Upgrade and remove the exception when a supported patched version is available. | 2026-09-01 |

Expired exceptions must be removed. An exception without an owner, rationale,
mitigation, and expiry date is invalid.
