---
title: Manage sessions and devices
description: Identify and revoke account sign-ins.
sidebar:
  order: 90
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

The session list helps detect an unexpected device and cut access without immediately changing all account data.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | My account → Security → Manage sessions |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **My account → Security → Manage sessions**.


![Manage sessions and devices — desktop screen](/docs/screenshots/account-sessions-en-light.png)

*Manage sessions and devices — desktop screen*

![Manage sessions and devices — mobile screen](/docs/screenshots/account-sessions-en-mobile.png)

*Manage sessions and devices — mobile screen*

## How do I use it?

1. Identify the current device using the Current label.
2. Review device, browser, available location and last activity.
3. Revoke one session or every other session.

### Expected result

Browser identification depends on the user agent and may remain generic.

## How does it work?

- Browser identification depends on the user agent and may remain generic.
- Location appears only when available without exposing precise position.
- A revoked session must sign in again on its next protected request.

## Good to know

:::note
- A Chromium-based browser may appear as Chrome when Brave cannot be reliably distinguished.
:::

## See also

- [Understand account security](/docs/en/account/security/overview/)
- [Change your password](/docs/en/account/security/password/)

<small>Version CartaVault : **master** · ID : `account.sessions`</small>
