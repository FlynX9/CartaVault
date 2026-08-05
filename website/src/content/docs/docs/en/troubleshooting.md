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

## Ask for help

Include the version, deployment mode, reproduction steps, and relevant logs. Remove passwords, cookies, tokens, personal addresses, and API keys before publishing an issue.
