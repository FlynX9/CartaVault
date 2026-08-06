---
title: Media, imports, and exports
description: Manage photos and exchange map data through KML and KMZ.
sidebar:
  order: 5
---

## Place photos

A place record can contain several photos. Upload a file or paste a clipboard capture with `Ctrl+V` when editing is allowed. Choose the primary image, reorder the gallery, open an image at full size, or delete it.

The primary image becomes the list thumbnail and the preview used by relevant screens. Accepted formats and maximum size depend on instance quotas.

## Media library

The **Media** panel collects photos from places on the current map. Search and browse them, open the source place, set a primary image, or delete one or more items.

Private accommodation photos attached to trip nights do not enter this library. They remain attached to that night only.

## Import KML or KMZ

1. Open the target map and choose **Import**.
2. Select a KML or KMZ file.
3. Wait for the preview analysis.
4. Review detected places, possible duplicates, media, and warnings.
5. Confirm the import, forcing explicitly flagged items only after checking them.

Imported places receive the protected **Imported** category when the source has no CartaVault classification. Large imports can run in the background when Redis and a worker are enabled.

Keep the page open for a synchronous import. In asynchronous mode, progress remains available through task history.

## Handle duplicates

The preview reduces accidental duplication of nearby or similarly named places. A warning does not delete anything automatically. Compare coordinates and content, then keep, skip, or force the item through the offered controls.

## Export a map

From the map catalog, open the KML/KMZ export action. Options include the supported information, styles, and media. The server builds the file and the browser downloads it.

Trip PDF, GPX, KMZ, and Google Maps exports are covered by [Timeline and trip exports](/docs/en/timeline-exports/).

## Privacy and storage

Photos are stored on the CartaVault instance. Temporary exports use export storage and are cleaned according to server policy. A downloaded export is a portable copy: protect it when it contains private coordinates, photos, or descriptions.
