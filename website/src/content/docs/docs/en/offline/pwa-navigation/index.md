---
title: Use CartaVault without a network
description: Understand the PWA shell, available screens and limits.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Application precaching reopens the interface and menus, while private packages supply selected maps and trips.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Installed application or HTTPS-served instance |
| **Access** | User |

## Where can I find it?

Follow this path in the interface : **Installed application or HTTPS-served instance**.


![Use CartaVault without a network — desktop screen](/docs/screenshots/places-france-en-light.png)

*Use CartaVault without a network — desktop screen*

![Use CartaVault without a network — mobile screen](/docs/screenshots/places-france-en-mobile.png)

*Use CartaVault without a network — mobile screen*

## How do I use it?

1. Open CartaVault online at least once after each update.
2. Prepare the required maps or trips.
3. Test offline startup before departure.

### Expected result

The service worker caches the exact application build.

## How does it work?

- The service worker caches the exact application build.
- Private data is separated by account in IndexedDB.
- The browser may purge storage according to its policy; CartaVault displays an estimate.

## Good to know

:::note
- Production requires a secure HTTPS context; a plain HTTP LAN address on mobile may not enable the service worker.
:::

## See also

- [Prepare a map offline](/docs/en/offline/maps/)
- [Prepare a trip offline](/docs/en/offline/trips/)
- [Manage offline data](/docs/en/account/offline-data/)

<small>Version CartaVault : **master** · ID : `offline.pwa-shell`</small>
