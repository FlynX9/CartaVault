---
title: Prepare a trip offline
description: Keep stops, nights, route geometry and basemap before departure.
sidebar:
  order: 30
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

A trip must remain readable when mobile connectivity is absent or unreliable.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Trips → Make available offline |
| **Access** | User, Viewer |

## Where can I find it?

Follow this path in the interface : **Trips → Make available offline**.


![Prepare a trip offline](/docs/screenshots/trip-offline-fr-light.png)

*Prepare a trip offline*

## How do I use it?

1. Calculate required routes before downloading.
2. Open Make available offline and review content.
3. Let the download complete, then verify it in My account.

### Expected result

The package includes trip and map data, saved routes and CartaVault Vector tiles when available.

## How does it work?

- The package includes trip and map data, saved routes and CartaVault Vector tiles when available.
- The manager continues downloading while the page/PWA remains active.
- Edits and new route calculations remain unavailable offline.

## Good to know

:::note
- After reload, only work persisted by the browser can be resumed.
:::

## See also

- [Prepare a map offline](/docs/en/offline/maps/)
- [Manage offline data](/docs/en/account/offline-data/)
- [Create and organize a trip](/docs/en/trips/create-plan/)

<small>Version CartaVault : **master** · ID : `trips.offline`</small>
