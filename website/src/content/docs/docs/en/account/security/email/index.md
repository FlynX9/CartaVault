---
title: Change your email address
description: Replace the account address after a security check.
sidebar:
  order: 40
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Email is used for sign-in, recovery and important notifications, so changing it must verify identity.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | My account → Security → Email address → Change |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **My account → Security → Email address → Change**.


![Change your email address — desktop screen](/docs/screenshots/account-email-change-en-light.png)

*Change your email address — desktop screen*

![Change your email address — mobile screen](/docs/screenshots/account-email-change-en-mobile.png)

*Change your email address — mobile screen*

## How do I use it?

1. Enter the new address.
2. Enter the current password.
3. Confirm and complete the sent verification when email delivery is configured.

### Expected result

The server validates format and uniqueness.

## How does it work?

- The server validates format and uniqueness.
- The current password is checked before the change.
- Relevant security events are recorded without secrets.

## Good to know

:::note
- If email MFA is active, verify continued access before leaving the session.
:::

## See also

- [Understand account security](/docs/en/account/security/overview/)
- [Enable email MFA codes](/docs/en/account/security/email-mfa/)

<small>Version CartaVault : **master** · ID : `account.email`</small>
