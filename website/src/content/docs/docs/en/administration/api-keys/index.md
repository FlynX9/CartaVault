---
title: Manage instance providers and keys
description: Configure shared credentials and safeguards.
sidebar:
  order: 50
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

An instance key offers a common service without requiring every user to own a key, while demanding cost and error supervision.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → API keys |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → API keys**.


![Manage instance providers and keys — desktop screen](/docs/screenshots/admin-api-keys-en-light.png)

*Manage instance providers and keys — desktop screen*

![Manage instance providers and keys — mobile screen](/docs/screenshots/admin-api-keys-en-mobile.png)

*Manage instance providers and keys — mobile screen*

## How do I use it?

1. Add or edit an instance credential.
2. Test it without revealing the secret.
3. Configure compatible services and thresholds.

### Expected result

Secrets are encrypted and masked after saving.

## How does it work?

- Secrets are encrypted and masked after saving.
- Sanitized diagnostics expose provider, status and useful error information.
- A personal key may remain preferred according to account settings.

## Good to know

:::note
- Client counters are indicative; authoritative billing must be checked at the provider.
:::

## See also

- [Manage personal API keys](/docs/en/account/api-keys/)
- [Prepare CartaVault Vector basemaps](/docs/en/administration/cartavault-vector/)
- [Configure transactional email](/docs/en/self-hosting/email/)

<small>Version CartaVault : **master** · ID : `admin.api-keys`</small>
