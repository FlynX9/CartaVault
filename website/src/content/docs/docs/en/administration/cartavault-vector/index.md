---
title: Prepare CartaVault Vector basemaps
description: Download OSM extracts and generate country vector maps.
sidebar:
  order: 60
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

CartaVault Vector provides consistent instance-served cartography reusable offline without relying on third-party tile caching terms.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → General → CartaVault basemap |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → General → CartaVault basemap**.


![Prepare CartaVault Vector basemaps — desktop screen](/docs/screenshots/admin-vector-en-light.png)

*Prepare CartaVault Vector basemaps — desktop screen*

![Prepare CartaVault Vector basemaps — mobile screen](/docs/screenshots/admin-vector-en-mobile.png)

*Prepare CartaVault Vector basemaps — mobile screen*

## How do I use it?

1. Enable CartaVault Vector and choose a preparation strategy.
2. Select a supported country and start Download and prepare.
3. Follow phases and percentage; update, retry or delete the basemap.

### Expected result

Geofabrik supplies the controlled extract and Planetiler runs only during generation.

## How does it work?

- Geofabrik supplies the controlled extract and Planetiler runs only during generation.
- One basemap is generated at a time and the task persists server-side.
- Users then download tiles from this prepared basemap; each device does not regenerate the source extract.

## Good to know

:::note
- Storage and generation time vary greatly by country and zoom levels.
:::

## See also

- [Prepare a map offline](/docs/en/offline/maps/)
- [Manage offline data](/docs/en/account/offline-data/)
- [Configure the instance](/docs/en/administration/general/)

<small>Version CartaVault : **master** · ID : `admin.vector-basemaps`</small>
