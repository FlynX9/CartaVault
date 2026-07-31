# Transactional email in V1

CartaVault V1 supports **Resend only** for transactional delivery. The existing
`EmailProvider` protocol remains the boundary around delivery so another
provider can be added later, but a generic SMTP implementation is deliberately
out of scope for V1.

This decision keeps one operational path to configure, verify and monitor. An
SMTP abstraction would add TLS modes, authentication variants, connection
pooling and provider-specific retry behavior without a demonstrated deployment
need. Reconsider SMTP only when a supported self-hosted deployment cannot use
Resend or when several operators request it with concrete server requirements.

## Delivered events

- pending-registration notification to administrators;
- registration approval;
- password-reset link;
- map invitation for existing users;
- map invitation and account creation for new users;
- password-change security alert, including reset confirmation;
- email-change security alert to both the previous and current addresses;
- administrator Resend verification message.

Map invitations contain the existing opaque, hash-only, single-use token. The
link expires according to `CARTAVAULT_INVITATION_HOURS`. Password-reset tokens
remain hash-only, single-use and independently time limited.

## Configuration and disabling

Set `EMAIL_PROVIDER=resend` and configure the encrypted Resend API key from the
administration interface. Sender identity and reply-to are configurable. Every
event has French and English HTML and plain-text templates under
`backend/app/emails/templates`.

Set `EMAIL_PROVIDER=none` to explicitly disable delivery. Missing credentials
also disable effective sending without exposing a secret or breaking the
underlying business transaction.

## Failure and retry behavior

Delivery happens after the invitation or account mutation has committed. A
mail outage therefore never rolls back a password change, email change or map
invitation. Failures are logged with an event, internal user/map identifier and
stable error code; recipient addresses, tokens and provider secrets are not
logged.

Resend calls use a bounded retry policy configured by:

- `EMAIL_PROVIDER_TIMEOUT_SECONDS` (10 seconds by default);
- `EMAIL_PROVIDER_MAX_ATTEMPTS` (2 by default);
- `EMAIL_PROVIDER_RETRY_DELAY_SECONDS` (1 second by default).

Only rate limits, provider 5xx responses, connection failures, timeouts and
invalid transient responses are retried. Permanent 4xx rejections fail
immediately. V1 intentionally has no durable email queue: the application is a
synchronous single-instance service, and issue #65 documents the future worker
boundary if guaranteed asynchronous delivery becomes necessary.
