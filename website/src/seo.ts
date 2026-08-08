/**
 * A regular Astro production build is public by default. Preproduction must
 * opt out explicitly through the deployment script. Development stays
 * non-indexable so a local server can never advertise itself to crawlers.
 */
export const isIndexableDeployment =
  import.meta.env.PROD && import.meta.env.PUBLIC_SITE_INDEXABLE !== 'false';
