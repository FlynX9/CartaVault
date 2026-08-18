---
title: Enable email MFA codes
description: Request a code at every sign-in when TOTP is not configured.
sidebar:
  order: 70
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Email codes provide an additional protection layer for accounts that do not yet use a TOTP application.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | My account → Security → Email code |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **My account → Security → Email code**.


![Enable email MFA codes — desktop screen](/docs/screenshots/account-email-mfa-en-light.png)

*Enable email MFA codes — desktop screen*

![Enable email MFA codes — mobile screen](/docs/screenshots/account-email-mfa-en-mobile.png)

*Enable email MFA codes — mobile screen*

## How do I use it?

1. Open Email code.
2. Enter the current password.
3. Request the code and validate it according to the received instructions.

### Expected result

The code is single-use, short-lived and attempt-limited.

## How does it work?

- The code is single-use, short-lived and attempt-limited.
- TOTP can still be enabled later and replaces this method.
- When TOTP is active, the Email code card is hidden.

## Good to know

:::note
- This method depends on the instance email service being available.
:::

## See also

- [Understand account security](/docs/en/account/security/overview/)
- [Configure TOTP authentication](/docs/en/account/security/totp/)
- [Change your email address](/docs/en/account/security/email/)

<small>Version CartaVault : **master** · ID : `account.email-mfa`</small>
