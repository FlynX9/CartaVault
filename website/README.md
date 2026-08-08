# CartaVault marketing website

Static Astro website for `cartavault.fr`. Production requires only the files
generated in `dist/` or `dist-prod/`; no Node.js runtime, database, CMS,
analytics or form backend is used.

## Local development

```bash
cd website
npm ci
npm run dev
npm run verify
```

`npm run verify` runs Astro/TypeScript checks, creates the production build and
verifies essential routes, metadata and image budgets.

## Public and preproduction builds

The build mode is deliberately encoded in the command so an omitted environment
variable cannot accidentally publish `noindex` metadata:

```bash
# Public, indexable artifact for cartavault.fr
npm run build:prod        # output: dist-prod/

# Private preproduction artifact
npm run build:preprod     # output: dist-preprod/
```

`npm run build` also produces a public, indexable artifact in `dist/`.
`npm run build:release` remains available for release automation and writes to
`dist-release/`. Development and preproduction are non-indexable; every public
build is checked for canonical URLs, absence of `noindex`, sitemap consistency,
`robots.txt`, and Apache headers before the command succeeds.

## Content and translations

- shared bilingual copy: `src/content/site.ts`;
- shared layout and SEO: `src/layouts/BaseLayout.astro`;
- reusable UI: `src/components/`;
- routes: `src/pages/`;
- optimized product screenshots: `public/images/`, copied from
  `../docs/screenshots/` and kept free of real or sensitive data.

Add a page slug to `pageSlugs`, provide both `fr` and `en` entries, then run
`npm run verify`. Sitemap entries and alternate-language links are generated
from the same source. Public URLs are intentionally centralized in `external`.

## Manual o2switch deployment

1. In cPanel, create the `cartavault.fr` domain and select an empty document
   root dedicated to the marketing site. Do not use the application directory.
2. Point the `@` DNS record to o2switch. Point `www` to the same target; the
   included `.htaccess` redirects it permanently to the apex domain.
3. Enable the o2switch TLS certificate and verify HTTPS before publication.
4. Run `npm ci && npm run build:prod` from `website/`.
5. Upload **the contents** of `website/dist-prod/`, including `.htaccess`, to the
   domain root via SFTP or cPanel File Manager.
6. Check `/fr/`, `/en/`, `/robots.txt`, `/sitemap.xml` and a missing URL.

For rollback, keep the previous `dist/` archive outside the public directory
and restore it atomically. Never upload `.env`, source files, SSH keys,
`node_modules` or repository history.

## Optional manual GitHub deployment

`.github/workflows/website.yml` always checks the site. Its deployment job runs
only after a manual dispatch with `deploy=true` and uses these GitHub Secrets:

- `O2SWITCH_SSH_HOST`, `O2SWITCH_SSH_PORT`, `O2SWITCH_SSH_USER`;
- `O2SWITCH_SSH_PRIVATE_KEY`;
- `O2SWITCH_DEPLOY_PATH`, restricted to the marketing domain document root.

The workflow never prints credentials and does not deploy on ordinary pushes.

## Troubleshooting

- A blank site usually means the contents of the selected build directory were uploaded one level
  too deep.
- Never publish `dist-preprod/` on `cartavault.fr`: it intentionally contains
  both HTML and HTTP `noindex` safeguards.
- If redirects or error pages fail, confirm hidden `.htaccess` files are shown
  and uploaded, and that Apache overrides are enabled by o2switch.
- If a route is missing from the sitemap, add its slug to the shared content
  registry rather than hand-editing XML.
