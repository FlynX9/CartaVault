import { appendFile, copyFile, rm, stat } from 'node:fs/promises';

const outputDirectory = process.argv[2] ?? 'dist-prod';
const deploymentMode = process.argv[3] ?? 'preprod';
const output = new URL(`../${outputDirectory}/`, import.meta.url);
await stat(output);

// The documentation now uses the optimized ICO. Keep the legacy 3 MiB SVG out
// of the deployable artifact even while it remains available in public assets.
await rm(new URL('favicon.svg', output), { force: true });
await copyFile(new URL('sitemap-index.xml', output), new URL('sitemap.xml', output));

if (deploymentMode === 'preprod') {
  await appendFile(new URL('.htaccess', output), `\n<IfModule mod_headers.c>\n  <FilesMatch "\\.html?$">\n    Header always set X-Robots-Tag "noindex, nofollow, noarchive"\n  </FilesMatch>\n</IfModule>\n`);
}

console.log('Production artifact cleaned.');
