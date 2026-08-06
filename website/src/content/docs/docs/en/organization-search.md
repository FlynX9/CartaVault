---
title: Organization and search
description: Classify places, combine filters, and use map search effectively.
sidebar:
  order: 4
---

## Categories

Categories describe what a place is: architecture, museum, nature, accommodation, food, and so on. A place can have several categories, with one primary category displayed in the list and record.

The **Categories** panel creates, renames, illustrates, and deletes unprotected categories. **Imported** is reserved for imports and cannot be deleted. Check the places using another category before removing it.

## Statuses

Statuses describe tracking state, such as *To discover*, *Planned*, *Visited*, or *To verify*. Each status has a name, color, order, and functional state. The functional state lets CartaVault calculate visited and unvisited counts even when labels are customized.

Colors are reused by markers, lists, and the dashboard. Reorder statuses by dragging them in the management panel.

## Tags

Tags provide free-form, cross-category classification for priority, season, group, theme, or your own conventions. They complement categories rather than replace them. Short, consistent names produce better facets.

## Search the place list

The **Places** search field looks through indexed place information. Quick filters isolate all, visited, unvisited, or favorite places. The **Filters** panel combines statuses, categories, tags, and available facets.

Sorting is a persisted preference. **Reset filters** clears filters only and preserves the selected sorting rule. Change the order through the sort control.

Large lists are virtualized, so only visible rows are rendered. Result order and position remain stable when opening a record and returning to the list.

## Selection and bulk actions

Enable selection mode to choose multiple places. Depending on permissions, bulk actions apply a status, category, or tag, add places to a trip day, or move them to trash.

Before a destructive bulk action, verify both the selected count and active filters.

## Search on the map

Map search accepts a name, address, or coordinates. Results appear temporarily on the map. You can center the view, create a permanent place, or—while planning a trip—add the result to the selected day, night, departure, or arrival.

Stadia is the default provider and works without a personal key. An optional verified Stadia Places key uses your own plan. If a valid Google Places key is stored under **Profile > API keys > Place search** and **Google Places** is selected in that category, the same surface uses Google Places. Results close after a successful trip addition.

## Coordinates, region, and country checks

CartaVault derives the region from coordinates when reverse geocoding succeeds. Use the explicit refresh action to recalculate it. A manually entered region survives an ordinary coordinate change until you request a refresh.

An outside-country location raises a warning. The outside-country mask can be toggled without blocking map interaction.
