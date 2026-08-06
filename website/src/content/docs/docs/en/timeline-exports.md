---
title: Timeline and trip exports
description: Explore a journey visually and produce documents or route files.
sidebar:
  order: 9
---

## Open the timeline

Enable **Trip timeline** from the Trip panel. The Places panel and any open record close to give the map to the journey. The viewport fits the complete trip rather than the whole country.

The timeline contains departure, stops, nights, and arrival. Colored zones represent days. A red warning identifies an incomplete day or night.

## Navigate

Click a point, use the mouse wheel over the timeline, drag the timeline horizontally, or press the keyboard left/right arrows. The active point returns to the center between the chevrons.

Selection:

- colors and enlarges the active point;
- emphasizes the relevant route or routes on the map;
- displays the segment from the active point to the next point in the lower summary;
- opens the linked record for a place or accommodation.

Selecting a night highlights both the route arriving there and the route leaving it. The overall trip zoom remains stable while navigating.

## Segment summary

The summary shows the segment's departure name, distance, driving time, and arrival name. Values remain unavailable until the corresponding route is calculated.

## PDF export

The **Export options** dialog can include:

- the overall trip map;
- one daily map with route and stages;
- primary place photos;
- Google Maps QR codes, Waze QR codes, or both.

The document follows the account language. Each day includes stops, visit duration, and travel between stages. QR codes contain coordinate-based links only; generation does not contact Google Maps or Waze.

PDF basemaps may require the server to download configured OpenStreetMap tiles. A missing tile should not prevent the rest of the document from being produced.

## GPX export

GPX supplies calculated tracks to compatible applications. Recalculate stale days before exporting to avoid incomplete tracks.

## KMZ export

KMZ provides a portable cartographic representation of the trip and its points for compatible tools.

## Google Maps links

Google Maps export splits a day into multiple links when its points exceed one navigation URL's capacity. Warnings identify days or segments that could not be included.

## Download behavior

Generation happens on the server. CartaVault waits until the browser has actually received the file before closing the dialog, avoiding downloads silently blocked by popup protection. If it fails, keep the dialog open, read the error, and retry after correcting the cause.
