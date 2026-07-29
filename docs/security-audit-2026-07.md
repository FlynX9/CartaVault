# Security audit — authentication and RBAC

Audit date: 2026-07-29. Scope: current CartaVault source tree, with emphasis
on OWASP ASVS session/access-control requirements and OWASP API Top 10 BOLA,
broken authentication, broken object-property authorization, and unrestricted
resource-consumption risks.

This is a source and automated-test audit; it is not a penetration test of a
running production instance. Do not publish details of a newly found critical
issue in a public issue. Report it through the repository's private security
reporting channel instead.

## Method and evidence

- Reviewed FastAPI router registration and the application-wide CSRF dependency
  in `backend/app/main.py`.
- Traced authentication, session, password, account, invitation, map,
  place/media, import/export, trip and trash authorization paths.
- Reviewed the permission helpers and map-scoped query patterns used by related
  resources.
- Exercised the multi-user/multi-map regression suite, including owners,
  editor, viewer and outsider scenarios, known-UUID access, media and exports.
- Added regressions for registration enumeration and sensitive-session
  rotation in `backend/tests/test_security_targeted.py`.
- Reviewed configuration templates, container deployment documentation,
  credential encryption, image/KMZ validation and temporary-export handling.

The target regression command is:

```powershell
Set-Location backend
.\.venv\Scripts\python -m pytest tests/test_security_targeted.py -q --basetemp ..\.pytest_tmp_issue52
```

## Role matrix

All application data is private by default. An unauthenticated caller receives
only health, public authentication, public invitation and setup endpoints. A
known UUID for an inaccessible private resource is intentionally answered with
`404`; an authenticated member without the required write role receives `403`.

| Capability | Administrator | Map owner | Editor | Viewer | Authenticated outsider | Unauthenticated |
|---|---|---|---|---|---|---|
| List/read accessible maps, places, photos, categories, tags, statuses and trips | All maps | Own map | Shared map | Shared map | No foreign data | No |
| Create/update content, photos, categories, tags, statuses and trip structure | Yes | Yes | Yes | No | No | No |
| Import data | Yes | Yes | Yes | No | No | No |
| Generate/download map or trip exports | Yes | Yes | Yes | Yes | No | No |
| Map settings and place-field configuration | Yes | Yes | Editor for fields | Read fields | No | No |
| Members, invitations and ownership transfer | Yes | Yes | No | No | No | No |
| Soft delete/restore/permanent purge | Yes | Owner scope | Editor for place/trip; not map | No | No | No |
| Account, sessions, avatar and personal Google Routes credential | Own account | Own account | Own account | Own account | Own account | No |
| User administration, quotas, instance status and global Resend credential | Yes | No | No | No | No | No |

An administrator is deliberately global: it can inspect all maps and use the
administration console. This is a privileged operational role, not a
map-membership role.

## Authenticated endpoint inventory

Every write route is covered by the application-level `require_csrf`
dependency. The groups below enumerate the authenticated API surface and its
authorization boundary; `GET /openapi.json` remains the generated route-level
reference.

| Route group | Access classification |
|---|---|
| `/auth/me`, `/auth/logout`, `/auth/change-password` | Current valid session; logout/password change require CSRF |
| `/account/*`, `/account/integrations/google-routes/*` | Current valid session and own-user scope |
| `/dashboard` | Current user; all aggregates constrained to accessible maps |
| `/countries/*` | Authenticated catalog read |
| `/maps/*`, `/invitations/pending/*` | Map role or invitation recipient; membership changes/transfer require owner |
| `/places/*`, `/photos/*`, `/media/*` | Resource is resolved through its map role; viewer read, editor write, owner-only destructive map actions |
| `/categories/*`, `/tags/*`, `/statuses/*` | Map-scoped resource role; viewer read, editor write |
| `/maps/{map_id}/imports/*`, `/exports/*` | Editor+ for import; viewer+ for export, with export owner/map checked at download |
| `/trips/*`, `/trip-days/*`, `/trip-stops/*`, `/trip-nights/*`, `/trip-departures/*`, `/trip-arrivals/*` | Parent trip/map role is required for direct and indirect identifiers |
| `/trash/*` and legacy place-trash routes | Deleted resource is resolved with its original map scope; map restore/purge requires owner |
| `/admin/*`, `/admin/console/*`, `/admin/quotas/*`, `/admin/registration-requests/*` | Global administrator only |

The public exceptions are `/`, `/auth/login`, registration and password-reset
flows, public invitation inspection/acceptance, and the one-time `/setup/*`
flow. Setup writes additionally require the setup token and are unavailable
after the first active administrator exists.

## Findings and remediation

| Severity | Finding | Exploitation impact | Resolution |
|---|---|---|---|
| High | `POST /auth/register` returned `409` for an existing account or pending request. | An internet caller could enumerate registered or pending email addresses. | Fixed: all valid registration attempts now return the same `202` payload. Existing/pending paths perform an Argon2 hash to reduce timing distinction; a concurrent uniqueness collision has the same response. |
| Medium | Password and email changes invalidated other sessions but retained the current session identifier. | A compromised or fixed current session could remain valid after a sensitive credential change. | Fixed: revoke every existing session and issue a new opaque session/CSRF pair after password or email change. |
| Low (residual) | Public-auth throttling is process-local. | A distributed deployment can spread attempts across workers. | Keep the in-process guard and enforce IP/account limits at the reverse proxy or a shared rate-limit service before production scale-out. |
| Low (residual) | No MFA or administrator audit trail is currently implemented. | Higher impact if an administrator credential is compromised; limited forensic visibility. | Track separate MFA and immutable audit-log work before a high-risk/public deployment. |

## Areas reviewed with no issue observed

- Opaque session and CSRF values are generated with `secrets`, persisted as
  SHA-256 hashes, expire server-side, and are checked against both cookie and
  header on authenticated writes.
- Cookies use `HttpOnly` for the session, `SameSite=Lax`, path `/`, and the
  deployment-controlled `Secure` flag. Production Compose sets
  `CARTAVAULT_COOKIE_SECURE=true` for HTTPS reverse proxies.
- Login creates a new session, logout revokes server-side, account deletion,
  password reset and administrator deactivation revoke sessions, and inactive
  accounts cannot reuse a session.
- Passwords use Argon2id; user password hashes and full Google/Resend keys are
  not returned by API schemas. Google and Resend secrets are Fernet encrypted
  with the deployment master key and account anonymization deletes personal
  Google credentials.
- Map, place, photo, category, tag, status, trip and media access resolve
  authorization through the owning map. The multi-user tests cover UUID
  substitution, cross-map associations, revocation of membership and media
  downloads.
- Owner transfer requires an existing member, preserves one owner, and prevents
  self-demotion/removal of the owner through ordinary membership updates.
- KMZ parsing uses `defusedxml`; upload/image storage validates decoded image
  content, limits sizes and entries, and storage paths are not returned to the
  client. Temporary export download paths include user and map authorization.

## Production-readiness conditions

The reviewed code is suitable for a controlled production deployment provided
that HTTPS is terminated correctly, `CARTAVAULT_COOKIE_SECURE=true`, secrets
are kept outside Git, PostgreSQL is private, reverse-proxy rate limits are in
place, and the targeted suite remains green. Before opening registration to a
larger audience, perform a live HTTPS reverse-proxy/CORS test, dependency scan,
and an independent authenticated penetration test with separate tenant
accounts.
