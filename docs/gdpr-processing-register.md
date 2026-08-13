# SaaS GDPR processing register template

Each CartaVault operator should complete this register for its deployment and
review it whenever a provider, integration or retention period changes.

| Processing activity | Personal data | Purpose / legal basis | Recipients / processors | Default retention |
| --- | --- | --- | --- | --- |
| Account and access | E-mail, display name, password hash, session metadata | Contract, security | Hosting provider, transactional e-mail provider | Account lifetime; anonymized on deletion |
| Security logging | Hashed target e-mail and client IP, event metadata | Legitimate interest / security | Hosting provider | 90 days, configurable |
| User content | POIs, maps, trips, links, uploaded media metadata and optional GPS/EXIF data | Contract | Hosting/storage provider; selected map/routing/place provider on use | Until user deletion or configured trash expiry |
| Transactional e-mail | E-mail address and message content | Contract / security | Configured e-mail processor | Provider agreement and delivery-log policy |
| Optional analytics | Only data documented for the selected provider | Consent where required | Selected analytics processor | Defined by operator; disabled by default |

## Data subject requests

- **Access / portability:** authenticated user export at `GET /api/account/privacy/export`.
- **Rectification:** account profile and content editing interfaces.
- **Erasure:** re-authenticated account deletion, subject to map-ownership and
  last-administrator safeguards.
- **Consent withdrawal:** account privacy preferences; any optional tracking
  must stop immediately after withdrawal.

Document any statutory retention obligation separately. Do not add a tracker,
pixel or embedded third-party widget without recording its data flow and, where
needed, updating consent and policy material.
