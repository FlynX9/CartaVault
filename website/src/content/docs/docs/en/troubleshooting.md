---
title: Troubleshooting
description: Diagnose common problems without exposing secrets.
sidebar:
  order: 5
---

## Sign-in returns “Invalid CSRF token”

Check that the public URL exactly matches the address used in the browser, including the protocol. Verify `CARTAVAULT_PUBLIC_URL`, `FRONTEND_PUBLIC_URL`, `CORS_ALLOWED_ORIGINS`, the reverse proxy, and the cookie Secure attribute.

## The backend does not start on Windows

`WinError 10013` generally means that the port is reserved or already in use. Identify the process with `Get-NetTCPConnection`, stop the old server, or select another port.

## API documentation does not render

In the unified deployment, open `/api/docs`. The schema is served from `/api/openapi.json`. Receiving HTML instead of JSON usually indicates an incorrect proxy rule.

## Route calculation fails

Check the provider key, enabled APIs, and quotas. CartaVault backs off after rate-limit responses and reuses cached results while they remain valid.

## Address search returns irrelevant results

Check the provider under **Profile > Preferences > Places**. Stadia and Google Places use different indexes. For Google Places, verify the key and enable the matching Places API in Google Cloud. Add a country or city to ambiguous searches.

## Region remains empty

Use the explicit region-refresh action on the record. If it remains empty, reverse geocoding may not know a subdivision for those coordinates or may be temporarily unavailable. Check the coordinates before entering a manual region.

## A photo does not appear

Reload the record and check the media library. If it is still missing, inspect storage logs and quotas. A night photo is intentionally excluded from map media.

## An import or export remains pending

In standard mode, keep the interface open for synchronous work. With Redis, make sure Redis and the worker are healthy and use the same image version as the application. Also check import/export storage and free disk space.

## A PDF download does not start

Keep the export dialog open until transfer completes. An error remains there for retry. Check export-volume space and backend logs; popup blockers should not apply because CartaVault starts the download after receiving the file.

## An invitation email does not arrive

Check the recipient's notification center first. For email, verify the provider, sender, Resend key status, or SMTP configuration. A delivery failure does not necessarily cancel the invitation already created in CartaVault.

## Recover deleted data

Open **Trash** and restore the item before retention expires. Permanent deletion requires a backup restore; history and Undo/Redo are not backups.

## Ask for help

Include the version, deployment mode, reproduction steps, and relevant logs. Remove passwords, cookies, tokens, personal addresses, and API keys before publishing an issue.
