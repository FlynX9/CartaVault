---
title: Configure quota profiles
description: Define and assign limits without deleting existing data.
sidebar:
  order: 40
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Profiles distribute storage and capacity fairly on a shared instance while keeping rules understandable.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → Quotas |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → Quotas**.


![Configure quota profiles — desktop screen](/docs/screenshots/admin-quotas-en-light.png)

*Configure quota profiles — desktop screen*

![Configure quota profiles — mobile screen](/docs/screenshots/admin-quotas-en-mobile.png)

*Configure quota profiles — mobile screen*

![Configure quota profiles — desktop screen](/docs/screenshots/admin-quota-edit-en-light.png)

*Configure quota profiles — desktop screen*

![Configure quota profiles — mobile screen](/docs/screenshots/admin-quota-edit-en-mobile.png)

*Configure quota profiles — mobile screen*

## How do I use it?

1. Create or duplicate a profile.
2. Set limits and associated services, then save.
3. Assign it from Users or make it the default.

### Expected result

Unlimited differs from zero; zero blocks new creation.

## How does it work?

- Unlimited differs from zero; zero blocks new creation.
- Over-limit data remains but new affected operations are blocked.
- The unlimited system profile and assigned profiles are protected from inconsistent deletion.

## Good to know

:::note
- Editing a user quota opens a nested priority dialog above the console.
:::

## See also

- [Administer users](/docs/en/administration/users/)
- [Configure the instance](/docs/en/administration/general/)

<small>Version CartaVault : **master** · ID : `admin.quotas`</small>
