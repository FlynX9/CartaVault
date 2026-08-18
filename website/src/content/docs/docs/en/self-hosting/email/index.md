---
title: Configure transactional email
description: Enable verification, recovery, invitations, alerts and email MFA.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Security and collaboration workflows need to notify users and verify addresses without manual intervention.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Deployment variables for SMTP, or Administration → API keys for Resend |
| **Access** | instance-operator, Administrator |

## Where can I find it?

Follow this path in the interface : **Deployment variables for SMTP, or Administration → API keys for Resend**.


![Configure transactional email — desktop screen](/docs/screenshots/admin-api-keys-en-light.png)

*Configure transactional email — desktop screen*

![Configure transactional email — mobile screen](/docs/screenshots/admin-api-keys-en-mobile.png)

*Configure transactional email — mobile screen*

## How do I use it?

1. Choose SMTP, Resend or no transport.
2. Configure sender and secret outside source code.
3. Test verification, recovery and MFA flows.

### Expected result

Delivery uses branded FR/EN templates.

## How does it work?

- Delivery uses branded FR/EN templates.
- Codes and secrets are never written to logs.
- Failures retry according to transport policy.

## Good to know

:::note
- Without transport, dependent features remain limited and must say so clearly.
:::

## See also

- [Manage public registration](/docs/en/administration/public-registration/)
- [Enable email MFA codes](/docs/en/account/security/email-mfa/)
- [Manage instance providers and keys](/docs/en/administration/api-keys/)

<small>Version CartaVault : **master** · ID : `deployment.email`</small>
