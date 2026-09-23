# Current security and operations

As of 2026-09-23, this document is the current high-level security reference
for CartaVault. It summarizes controls implemented in the application; it is
not a penetration-test report or a guarantee for a misconfigured deployment.
The [July 2026 security audit](security-audit-2026-07.md) is retained as a
historical assessment and is not current-state documentation.

## Authentication and MFA

- Passwords use Argon2id and account-sensitive operations verify the current
  password where required.
- TOTP MFA supports setup, confirmation, login challenges, recovery-code login,
  recovery-code regeneration, and protected disable/reset operations.
- Email MFA supports password-protected enrollment, emailed-code confirmation,
  login challenges, cooldown/rate limits, and disable. TOTP and email MFA are
  mutually exclusive for one account.
- MFA setup and sensitive authentication attempts are rate-limited. Email code
  attempts expire and are bounded; recovery codes are single-use.

## Sessions and request protection

- Session and CSRF values are opaque, stored server-side as hashes, and expire
  or are revoked server-side.
- Authenticated writes require the session-bound CSRF cookie and matching
  `X-CSRF-Token` header.
- Password changes and MFA state changes revoke or rotate sessions as required
  by the operation, issuing a fresh CSRF pair when a new session is created.
- Production deployments must enable secure cookies behind HTTPS and keep
  secrets outside Git.

## Audit and authorization

- Authorization is enforced server-side through the owning map and role for
  maps, places, media, imports, exports and trips.
- Administrative role/state changes, selected MFA/authentication events and
  other security events are persisted without recording raw passwords, tokens,
  credentials or client IPs.
- The administration console exposes a bounded per-user activity timeline.
  A comprehensive immutable administrator audit log remains a roadmap item.

## Operator references

- [Administration settings audit](administration-audit.md)
- [Privacy, cookies and consent](privacy-and-cookies.md)
- [Provider credential boundary](provider-credential-boundary.md)
- [Backup and restore](backup-and-restore.md)
- [Background tasks and Redis](background-tasks.md)
