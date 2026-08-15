---
title: Store recovery codes
description: Recover access when the TOTP application is unavailable.
sidebar:
  order: 80
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Recovery codes prevent a lost or broken phone from permanently locking the account.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | My account → Security → TOTP application → Recovery codes |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **My account → Security → TOTP application → Recovery codes**.


![Store recovery codes](/docs/screenshots/account-recovery-codes-fr-light.png)

*Store recovery codes*

## How do I use it?

1. Copy or download codes during activation.
2. Store them securely outside CartaVault.
3. Regenerate them if exposure is suspected.

### Expected result

Each code works only once.

## How does it work?

- Each code works only once.
- Only hashes are stored by the server.
- Regeneration invalidates all previous codes.

## Good to know

:::note
- Codes are displayed in clear text only when created.
:::

## See also

- [Configure TOTP authentication](/docs/en/account/security/totp/)
- [Understand account security](/docs/en/account/security/overview/)

<small>Version CartaVault : **master** · ID : `account.recovery-codes`</small>
