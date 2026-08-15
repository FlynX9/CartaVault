---
title: Understand account security
description: Control email, password, MFA and sessions.
sidebar:
  order: 30
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

The panel groups protections and active devices to reveal weak configuration or unexpected access.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | User menu → Options → Security |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **User menu → Options → Security**.


![Understand account security](/docs/screenshots/account-security-fr-light.png)

*Understand account security*

## How do I use it?

1. Review the four summary indicators.
2. Choose an MFA method when needed.
3. Inspect sessions and use each sensitive action in its dedicated dialog.

### Expected result

Only one MFA method is active: TOTP replaces email codes.

## How does it work?

- Only one MFA method is active: TOTP replaces email codes.
- MFA status is strengthened with TOTP and active with email.
- Sensitive operations require the password or an active factor again.

## Good to know

:::note
- Prefer TOTP and keep recovery codes outside CartaVault.
:::

## See also

- [Change your email address](/docs/en/account/security/email/)
- [Change your password](/docs/en/account/security/password/)
- [Configure TOTP authentication](/docs/en/account/security/totp/)
- [Enable email MFA codes](/docs/en/account/security/email-mfa/)
- [Manage sessions and devices](/docs/en/account/security/sessions/)

<small>Version CartaVault : **master** · ID : `account.security`</small>
