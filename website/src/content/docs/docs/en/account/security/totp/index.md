---
title: Configure TOTP authentication
description: Strengthen sign-in with an authenticator application.
sidebar:
  order: 60
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

TOTP adds a temporary code generated on a separate device and is stronger than a second factor delivered to the same email account.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | My account → Security → Authenticator application (TOTP) |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **My account → Security → Authenticator application (TOTP)**.


![Configure TOTP authentication](/docs/screenshots/account-totp-fr-light.png)

*Configure TOTP authentication*

## How do I use it?

1. Confirm your password when requested.
2. Scan the QR code or copy the setup key into the app.
3. Enter the six-digit code and store recovery codes.

### Expected result

The secret is encrypted on the server and is not returned after activation.

## How does it work?

- The secret is encrypted on the server and is not returned after activation.
- Activation occurs only after validating the first code.
- Enabling TOTP disables email codes; methods do not stack.

## Good to know

:::note
- Keep the device clock accurate and store recovery codes offline.
:::

## See also

- [Understand account security](/docs/en/account/security/overview/)
- [Store recovery codes](/docs/en/account/security/recovery-codes/)
- [Enable email MFA codes](/docs/en/account/security/email-mfa/)

<small>Version CartaVault : **master** · ID : `account.totp`</small>
