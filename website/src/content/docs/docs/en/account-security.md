---
title: Account, preferences, and security
description: Personalize CartaVault, manage sessions, and protect your account.
sidebar:
  order: 10
---

## Profile

The **Profile** panel changes your display name and avatar. The name is visible to users with whom you share maps. Account information shows the email address, creation date, last sign-in, and owned-map count.

## Account security

Under **Security**, change the email address or password. Both operations require the current password. Sensitive changes revoke or rotate sessions as appropriate and produce a security notification when email delivery is configured.

Password reset uses a temporary, single-use link. The initial request always returns a generic response so it does not reveal whether an address owns an account.

## Sessions

The **Sessions** panel lists authenticated devices or browsers, recent activity, and the current session. Revoke one session or all other sessions. A revoked session must sign in again on its next protected request.

## General preferences

Preferences include:

- French or English interface;
- light or dark basemap;
- compact, comfortable, or spacious density;
- dashboard, maps, places, or last screen at startup;
- time zone;
- personal trash retention period;
- onboarding state.

Resetting preferences restores defaults without deleting maps or places.

## Routing preferences

Choose OSRM or Google Routes, then supported country, toll, highway, ferry, and traffic constraints. See [Routing and optimization](/docs/en/routing/) for their impact.

## Place-search provider

Stadia is available without a personal key. Google Places becomes selectable after a compatible key is stored and verified. The Places key is separate from the Routes key, even if both APIs belong to one Google Cloud project.

## Personal Google keys

Routes and Places keys are encrypted before storage. CartaVault never displays the full value after saving it. Use **Verify** after changes and delete unused credentials. Deletion requires your password.

## Undo and redo

Top-bar controls, `Ctrl+Z`, and `Ctrl+Y` undo or redo compatible recent operations, including place and trip-element additions, moves, and deletions. This UI history is session-bound and does not replace trash or backups.

## Delete your account

The sensitive zone requires a password and explicit acknowledgement. Safeguards prevent removal of the last administrator and require owned maps to be handled first. Transfer their ownership before deleting the account.
