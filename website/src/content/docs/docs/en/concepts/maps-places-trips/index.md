---
title: Understand maps, places and trips
description: CartaVault's core data organization model.
sidebar:
  order: 10
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

CartaVault separates the durable workspace that organizes data, the place record, and the temporary itinerary that reuses places. This avoids duplicating information while planning a journey.

## Before you start

| | |
| --- | --- |
| **Access** | Public, User |

## Illustration


![Places from a map are reused as stops in a trip.](/docs/screenshots/trip-france-fr-light.png)

*Places from a map are reused as stops in a trip.*

## How do I use it?

1. Create a map linked to a country.
2. Add and organize places in that map.
3. Reuse places as stops in one or more trips.

### Expected result

A map owns its categories, tags, statuses, members and settings.

## How does it work?

- A map owns its categories, tags, statuses, members and settings.
- A place remains the source of truth when reused across days.
- A trip stores its own durations, order, nights and calculated routes.

## Good to know

:::note
- The current release uses single-country maps; multi-country maps discussed in issues are not available.
:::

## See also

- [Browse the map vault](/docs/en/maps/catalog/)
- [Browse and search places](/docs/en/places/browse-search/)
- [Create and organize a trip](/docs/en/trips/create-plan/)

<small>Version CartaVault : **master** · ID : `concepts.data-model`</small>
