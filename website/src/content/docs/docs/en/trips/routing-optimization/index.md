---
title: Calculate and optimize routes
description: Calculate day travel using an available provider.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Calculation exposes distance, duration and arrival time; optimization proposes a more efficient order without silently replacing the plan.

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Trips → day → Route or Optimize |
| **Access** | Map owner, Editor |

## Where can I find it?

Follow this path in the interface : **Trips → day → Route or Optimize**.


![Calculate and optimize routes — desktop screen](/docs/screenshots/trip-routing-en-light.png)

*Calculate and optimize routes — desktop screen*

![Calculate and optimize routes — mobile screen](/docs/screenshots/trip-routing-en-mobile.png)

*Calculate and optimize routes — mobile screen*

## How do I use it?

1. Check that the day contains the required locations.
2. Calculate one day or the complete trip.
3. Preview an optimization proposal and accept or cancel it.

### Expected result

OSRM remains the no-key engine; Google Routes and ORS depend on configured keys and preferences.

## How does it work?

- OSRM remains the no-key engine; Google Routes and ORS depend on configured keys and preferences.
- Changing a stop makes the route stale.
- Optimization applies only after confirmation.

## Good to know

:::note
- Calculation needs a connection; only previously calculated geometry remains available offline.
:::

## See also

- [Create and organize a trip](/docs/en/trips/create-plan/)
- [Manage personal API keys](/docs/en/account/api-keys/)
- [Manage instance providers and keys](/docs/en/administration/api-keys/)

<small>Version CartaVault : **master** · ID : `trips.routing`</small>
