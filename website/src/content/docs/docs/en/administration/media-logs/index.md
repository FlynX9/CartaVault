---
title: Configure media and instance logs
description: Limit images, optimize existing files and choose log retention.
sidebar:
  order: 80
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Administrators need to control disk usage and keep useful diagnostics without retaining technical data indefinitely.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → General → Media library and Instance logs |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → General → Media library and Instance logs**.


![Configure media and instance logs](/docs/screenshots/admin-media-logs-fr-light.png)

*Configure media and instance logs*

## How do I use it?

1. Set maximum size and resolution for new uploads.
2. Run existing-media optimization when needed.
3. Choose log retention and save.

### Expected result

Images are never enlarged.

## How does it work?

- Images are never enlarged.
- Optimization is tracked as a task and preserves already compliant files.
- Messages are filtered to remove secrets and unnecessary personal data.

## Good to know

:::note
- Back up before a large media optimization run.
:::

## See also

- [Upload photos and use GPS metadata](/docs/en/media/upload-exif/)
- [Monitor instance status](/docs/en/administration/instance-status/)
- [Configure privacy and compliance](/docs/en/administration/privacy-compliance/)

<small>Version CartaVault : **master** · ID : `admin.media-logs`</small>
