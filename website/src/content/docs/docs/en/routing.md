---
title: Routing and optimization
description: Configure a provider, calculate days, and understand optimization proposals.
sidebar:
  order: 8
---

## Choose a routing provider

Under **Profile > Preferences > Routing**, select an available provider:

- **OSRM** requires no personal key and calculates road routes;
- **Google Routes** requires a verified personal API key and enables supported Google options.

Google Routes keys are encrypted in the database. The interface later shows only a masked value and verification state. You can replace, verify, or delete the key after password confirmation.

## Route constraints

Depending on the provider, you can request in-country routes, avoid tolls, highways, or ferries, and select traffic handling. A constraint can make a segment impossible; CartaVault reports the warning rather than inventing a route.

## Calculate routes

**Calculate routes** processes days with enough points. Each day uses:

- the trip departure or previous night as its starting anchor;
- the day's stops in their current order;
- the next night or trip arrival as its ending anchor.

The result updates geometry, road distance, and driving time. Visit durations are added separately to produce the day total.

Changing a stop, order, or anchor marks the route for recalculation. An old geometry is not represented as current.

## Optimize a day

**Optimize** proposes a better stop order while keeping the day's starting and ending anchors fixed. The proposal shows before/after values and estimated savings. Nothing changes until you choose **Apply optimization**.

## Optimize the trip

Global optimization prepares proposals for all eligible days. It reuses valid route calculations and limits provider requests. If the trip changes between proposal and confirmation, the server rejects the stale proposal rather than overwrite your changes.

## Limits, cache, and backoff

CartaVault limits bursts and backs off after provider quota responses. Reusable results are cached. A retry-later message usually points to provider quota, a key configuration issue, or many calculations requested in quick succession.

## Read the metrics

- **Distance**: routed road distance, not a straight line.
- **Route**: driving duration returned by the provider.
- **Visits**: sum of planned stop durations.
- **Total**: route and visit time as shown in the summary.
- **Not calculated / recalculate**: missing data or results invalidated by a change.

See [Trips and days](/docs/en/trips/) for day composition.
