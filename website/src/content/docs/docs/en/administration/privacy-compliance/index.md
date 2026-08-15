---
title: Configure privacy and compliance
description: Publish operator, policies, consent and retention settings.
sidebar:
  order: 70
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

These settings make instance responsibilities explicit and adapt consent to services that are actually enabled.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → General → Privacy and compliance |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → General → Privacy and compliance**.


![Configure privacy and compliance](/docs/screenshots/admin-privacy-fr-light.png)

*Configure privacy and compliance*

## How do I use it?

1. Enable the section when it applies to the instance.
2. Choose Privacy-respecting or Consent required.
3. Fill operator, contact, policy URLs and retention durations, then save.

### Expected result

Privacy-respecting mode shows no banner while no optional service collects data.

## How does it work?

- Privacy-respecting mode shows no banner while no optional service collects data.
- Consent required mode shows the banner for affected features.
- Logs and sessions older than configured durations are purged automatically.

## Good to know

:::note
- Contact must be a valid email and policy URLs must pass server-side URL validation.
:::

## See also

- [Manage privacy and personal export](/docs/en/account/privacy/)
- [Configure the instance](/docs/en/administration/general/)
- [Monitor instance status](/docs/en/administration/instance-status/)

<small>Version CartaVault : **master** · ID : `admin.privacy`</small>
