---
title: Manage public registration
description: Allow account creation and choose administrator approval.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

A private family instance can remain closed while a public service accepts controlled requests.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → General → Public registration |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → General → Public registration**.


![Manage public registration](/docs/screenshots/admin-registration-fr-light.png)

*Manage public registration*

## How do I use it?

1. Enable or disable registration.
2. Choose whether verified accounts need administrator approval.
3. Save, then review requests from Users.

### Expected result

Email verification happens before optional approval.

## How does it work?

- Email verification happens before optional approval.
- Disabling registration does not erase existing requests.
- Public responses avoid unnecessarily revealing whether an account exists.

## Good to know

:::note
- The complete flow requires a working email transport.
:::

## See also

- [Configure the instance](/docs/en/administration/general/)
- [Administer users](/docs/en/administration/users/)
- [Configure transactional email](/docs/en/self-hosting/email/)

<small>Version CartaVault : **master** · ID : `admin.registration`</small>
