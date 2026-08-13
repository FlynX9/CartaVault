# Privacy, cookies and consent

CartaVault is privacy-first by default. A new deployment has no analytics,
marketing tracker or third-party consent-requiring browser integration enabled.
Consequently it does **not** display a cookie banner unless the instance
administrator explicitly selects the `consent_required` analytics mode.

## Browser storage inventory

| Storage | Purpose | Classification | Retention / removal |
| --- | --- | --- | --- |
| `cartavault_session` cookie | Authenticated server session | Strictly necessary | 14 days by default; revoked on logout, password change or account deletion |
| `cartavault_csrf` cookie | CSRF protection for authenticated mutations | Strictly necessary | Same lifetime as the session; not an authentication token |
| `cartavault:offline-active-user` local storage | Selects the current offline-data namespace | Functional | Cleared when offline data is removed / account context changes |
| `cartavault-offline` IndexedDB | User-selected offline maps, trips and thumbnails | Functional | Kept only on the device until the user deletes the offline package |
| Service-worker cache | Application shell and explicitly prepared offline content | Strictly necessary / functional | Browser-managed; removed by service-worker updates or offline-data deletion |

No advertising, marketing or behavioural analytics cookie is part of the
default product. External map, routing and place-search providers are called
only when the user invokes the relevant feature; they may receive the request
data needed to fulfil that request (such as map tile coordinates, a search
query or routing waypoints).

## Consent model

`GET /api/privacy/configuration` exposes the public, secret-free configuration.
When `analytics_mode` is `disabled` or `privacy_preserving`, no consent banner
is required. When it is `consent_required`, clients must obtain an explicit
choice before loading optional analytics:

- necessary security storage is always active;
- optional analytics, functional, marketing and third-party categories are
  disabled by default and independently recorded;
- users can withdraw or change their choice from **Mon compte > Confidentialité**;
- the current policy version is stored with the choice.

The backend never activates an analytics provider itself. An administrator must
provide the operator, contact and published policy URLs before enabling a
consent-requiring integration.

## Retention and privacy operations

- Expired sessions, action tokens and e-mail MFA codes are cleaned centrally.
- Authentication security events use the administrator-configured retention
  period (90 days by default).
- Instance log retention remains separately configurable in Administration.
- Temporary exports already expire after their configured short lifetime.
- Account deletion requires re-authentication and explicit confirmation. The
  current implementation anonymizes the account safely instead of physically
  removing referenced relational records.
- `GET /api/account/privacy/export` creates an authenticated ZIP/JSON export
  containing the requester’s account, owned maps and related content. It
  intentionally excludes passwords, sessions, CSRF values, MFA data, recovery
  codes, API credentials, encryption keys, other users’ private data and media
  binaries.

## Administrator deployment checklist

1. Set the legal operator name and privacy contact in Administration > Privacy.
2. Publish a privacy notice and cookie notice, then configure their HTTPS URLs.
3. Keep an up-to-date processor register for hosting, e-mail, map tiles,
   routing and place-search providers used by the deployment.
4. Select retention periods that match the organisation’s legal basis and
   contractual requirements.
5. Do not enable consent-requiring analytics until the client consent surface
   and the policies are live.

This document is product documentation, not legal advice. Each SaaS operator
remains responsible for its own legal notices, processor agreements and GDPR
assessment.
