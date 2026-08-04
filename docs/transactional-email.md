# Transactional email

CartaVault supports two interchangeable transports behind the same
`EmailProvider` contract:

- **Resend**, configured with the encrypted instance API key in Administration;
- **generic SMTP**, configured at runtime for a self-hosted or hosted relay.

Set `EMAIL_PROVIDER=none` to disable delivery explicitly. Email delivery is
best-effort and always happens after the protected business transaction has
committed: a provider outage cannot undo a password change, invitation or
registration decision.

## Delivered events

- pending-registration notification to administrators;
- email-address verification and registration approval;
- password-reset link;
- map share and ownership-transfer invitations for existing and future users;
- optional new-share notification through the same invitation event;
- password-change security alert for self-service changes, reset completion
  and administrator-forced resets;
- email-change security alert to both the previous and current addresses;
- administrator Resend verification message.

Every event has French and English HTML and plain-text templates under
`backend/app/emails/templates`.

Invitation, registration-verification and password-reset links use opaque
hash-only tokens. They expire, are single-use where required, and are never
written to delivery logs.

## Resend configuration

Set:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM_NAME=CartaVault
EMAIL_FROM_ADDRESS=no-reply@example.com
EMAIL_REPLY_TO=support@example.com
```

Configure the Resend API key from Administration. CartaVault stores it Fernet
encrypted and never returns the clear value through the API. The key remains a
runtime secret and must not be committed.

## Generic SMTP configuration

Example with STARTTLS and authentication:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM_NAME=CartaVault
EMAIL_FROM_ADDRESS=no-reply@example.com
EMAIL_REPLY_TO=support@example.com
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURITY=starttls
EMAIL_SMTP_USERNAME=cartavault
EMAIL_SMTP_PASSWORD=replace-with-a-runtime-secret
```

`EMAIL_SMTP_SECURITY` accepts:

- `starttls`: plain connection upgraded with a verified TLS context (default);
- `tls`: implicit TLS, usually on port 465;
- `none`: no transport encryption, only for a trusted private relay/network.

Username and password are optional for an unauthenticated private relay, but
must be provided together otherwise. TLS certificate verification cannot be
disabled. SMTP credentials are runtime environment/secret values; they are not
stored in Git, image layers, logs or API responses.

## Retry and failure strategy

Both transports use the same bounded retry policy:

```env
EMAIL_PROVIDER_TIMEOUT_SECONDS=10
EMAIL_PROVIDER_MAX_ATTEMPTS=2
EMAIL_PROVIDER_RETRY_DELAY_SECONDS=1
```

The delay grows exponentially between attempts and is capped at 30 seconds.
Only explicitly transient failures are retried:

- provider rate limits and HTTP 5xx;
- SMTP 4xx responses;
- connection loss, DNS/network errors and timeouts;
- malformed transient Resend responses.

Permanent HTTP/SMTP 5xx rejections, invalid recipients/senders and SMTP
authentication failures stop immediately. The stable error code is logged with
the event and internal user/resource identifier; addresses, message bodies,
tokens, passwords and provider secrets are never logged.

No durable email queue is claimed in the standard mono-instance deployment.
The bounded synchronous retries provide predictable behavior without making
email availability part of the database transaction. The optional Redis/worker
stack remains the extension point for a future durable outbox if guaranteed
delivery becomes a product requirement.

## Disabling delivery

```env
EMAIL_PROVIDER=none
```

Disabled or unconfigured delivery is handled as an expected operational state.
The underlying action remains successful and the safe failure code is retained
or logged where the workflow exposes delivery status.
