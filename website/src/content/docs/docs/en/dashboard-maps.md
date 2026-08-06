---
title: Dashboard and maps
description: Read the overview, create maps, and choose which place fields are displayed.
sidebar:
  order: 2
---

## What the dashboard covers

The dashboard aggregates only the maps the signed-in account can actually access. Being an instance administrator never grants implicit access to another user's private maps.

The first row counts places, maps, countries, and trips. Secondary indicators distinguish visited and unvisited places, favorites, media, places without photos, and planned or completed trips.

Analytics include:

- place distribution by status;
- the leading countries and categories;
- recently changed places and trips;
- data requiring attention: missing photos, categories, coordinates or regions, possible duplicates, stale routes, and incomplete map metadata;
- a geographic preview and recent place activity.

Quick actions apply to the selected **target map**. Select it before adding a place, importing a file, or creating a trip.

## Create a map

A map is the workspace that owns the places, trips, media, categories, statuses, tags, and access rules for one country.

1. Open **Maps** or select **New map** from the dashboard.
2. Enter a meaningful name.
3. Select the matching country.
4. Confirm and open the new map.

The country controls the initial viewport, flag, coordinate checks, and outside-country mask. It does not prevent you from intentionally saving an external place; CartaVault asks for confirmation first.

## Map catalog

Each card shows the country, place count, trip count, and your role. Shared maps also identify their owner. Search filters by map name or country.

Depending on your permissions, actions open the map, configure visible place fields, export it, manage members, or move it to trash.

## Choose visible fields

An owner or authorized editor can open **Map settings > Place fields**. Description, region, dates, condition, access, danger, links, rating, and favorite fields can be hidden for that map.

Hiding a field does not delete its data. Its value reappears when the field is enabled again.

## Delete and restore a map

Deletion moves the map and its contents to trash. Before the configured retention period expires, restoring the map also restores access to its places and trips. Permanent deletion cannot be undone.

## Roles

- **Owner**: full control, member management, and ownership transfer.
- **Editor**: content changes within the granted permissions.
- **Viewer**: read-only access.
- **Instance administrator**: platform administration without implicit private-map access.

See [Sharing and collaboration](/docs/en/sharing/) to invite members.
