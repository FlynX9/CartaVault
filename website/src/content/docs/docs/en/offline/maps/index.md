---
title: Prepare a map offline
description: Download places, organization, thumbnails and vector basemap.
sidebar:
  order: 10
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Offline preparation keeps essential map information in the browser for areas without connectivity.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Vault → map menu → Make available offline |
| **Access** | User, Viewer |

## Where can I find it?

Follow this path in the interface : **Vault → map menu → Make available offline**.


![Prepare a map offline](/docs/screenshots/map-offline-fr-light.png)

*Prepare a map offline*

## How do I use it?

1. Open the map offline action.
2. Review content and CartaVault Vector availability.
3. Download, then verify the package in My account.

### Expected result

The package keeps POIs, categories, tags, statuses, annotations and selected thumbnails.

## How does it work?

- The package keeps POIs, categories, tags, statuses, annotations and selected thumbnails.
- When the administrator prepared the country, vector tiles are served by the instance and then stored locally.
- The usual online basemap provider remains unchanged.

## Good to know

:::note
- Offline mode is read-only; imports, edits and synchronization require network access.
:::

## See also

- [Manage offline data](/docs/en/account/offline-data/)
- [Prepare a trip offline](/docs/en/offline/trips/)
- [Prepare CartaVault Vector basemaps](/docs/en/administration/cartavault-vector/)

<small>Version CartaVault : **master** · ID : `offline.maps`</small>
