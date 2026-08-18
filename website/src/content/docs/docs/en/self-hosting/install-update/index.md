---
title: Install and update CartaVault
description: Deploy the unified image with PostGIS and complete initial setup.
sidebar:
  order: 10
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

The unified image limits the standard deployment to CartaVault and PostgreSQL/PostGIS while keeping migrations and frontend on the same version.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Docker server → official Compose → setup wizard |
| **Access** | instance-operator |

## Where can I find it?

Follow this path in the interface : **Docker server → official Compose → setup wizard**.


![Install and update CartaVault — desktop screen](/docs/screenshots/login-en-light.png)

*Install and update CartaVault — desktop screen*

![Install and update CartaVault — mobile screen](/docs/screenshots/login-en-mobile.png)

*Install and update CartaVault — mobile screen*

## How do I use it?

1. Configure variables and persistent volumes.
2. Start PostGIS and CartaVault, then open setup.
3. Create the first administrator and verify instance status.

### Expected result

Migrations apply during startup before readiness.

## How does it work?

- Migrations apply during startup before readiness.
- The container runs unprivileged with a read-only application filesystem.
- Embedded documentation matches the image build.

## Good to know

:::note
- Expose an Internet-facing instance only behind HTTPS and a correctly configured reverse proxy.
:::

## See also

- [Monitor instance status](/docs/en/administration/instance-status/)
- [Configure transactional email](/docs/en/self-hosting/email/)
- [Use CartaVault without a network](/docs/en/offline/pwa-navigation/)

<small>Version CartaVault : **master** · ID : `deployment.install`</small>
