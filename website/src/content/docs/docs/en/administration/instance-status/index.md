---
title: Monitor instance status
description: Check versions, database, storage, services, resources and logs.
sidebar:
  order: 90
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## What is this feature for?

Diagnostics help understand failures or saturation without opening an SSH session on the server.

:::caution
This page covers instance administration and is only available to administrators.
:::

## Before you start

| | |
| --- | --- |
| **Where can I find it?** | Administration → Instance status |
| **Access** | Administrator |

## Where can I find it?

Follow this path in the interface : **Administration → Instance status**.


![Monitor instance status — desktop screen](/docs/screenshots/admin-instance-en-light.png)

*Monitor instance status — desktop screen*

![Monitor instance status — mobile screen](/docs/screenshots/admin-instance-en-mobile.png)

*Monitor instance status — mobile screen*

## How do I use it?

1. Refresh diagnostics.
2. Review summary, services, resources and versions.
3. Filter recent logs and use details to correlate an incident.

### Expected result

Each check has an independent state; an external outage does not hide other services.

## How does it work?

- Each check has an independent state; an external outage does not hide other services.
- Sensitive values are absent from responses.
- Version, Alembic revision and PostGIS status improve support.

## Good to know

:::note
- This complements host metrics; it does not replace backups and external monitoring.
:::

## See also

- [Configure the instance](/docs/en/administration/general/)
- [Configure media and instance logs](/docs/en/administration/media-logs/)
- [Install and update CartaVault](/docs/en/self-hosting/install-update/)

<small>Version CartaVault : **master** · ID : `admin.instance`</small>
