import { readFile, readdir, stat } from 'node:fs/promises';

const outputDirectory = process.argv[2] ?? 'dist';
const deploymentMode = process.argv[3] ?? 'public';
const indexable = deploymentMode === 'public';
const dist = new URL(`../${outputDirectory}/`, import.meta.url);
const required = ['index.html', 'fr/index.html', 'en/index.html', 'fr/features/index.html', 'en/features/index.html', 'docs/index.html', 'docs/fr/index.html', 'docs/en/index.html', 'docs/fr/trips/index.html', 'docs/en/trips/index.html', 'docs/openapi.json', 'pagefind/pagefind.js', '404.html', '500.html', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'sitemap-0.xml', '.htaccess'];
for (const file of required) await stat(new URL(file, dist));
const pages = ['fr/index.html', 'en/index.html', 'fr/legal/index.html', 'en/privacy/index.html'];
for (const file of pages) {
  const html = await readFile(new URL(file, dist), 'utf8');
  const markers = indexable ? ['<title>', 'rel="canonical"', 'property="og:title"', 'application/ld+json'] : ['<title>', 'property="og:title"', 'name="robots" content="noindex,nofollow"'];
  for (const marker of markers) {
    if (!html.includes(marker)) throw new Error(`${file} is missing ${marker}`);
  }
  if (!indexable && html.includes('rel="canonical"')) throw new Error(`${file} must not expose a canonical URL in preproduction`);
}
const robots = await readFile(new URL('robots.txt', dist), 'utf8');
if (!robots.includes('Allow: /') || robots.includes('Disallow: /')) throw new Error('robots.txt prevents crawlers from observing page-level noindex directives');
if (indexable && !robots.includes('Sitemap: https://cartavault.fr/sitemap.xml')) throw new Error('Public robots.txt does not reference the standard sitemap URL');
if (!indexable && robots.includes('Sitemap:')) throw new Error('Preproduction robots.txt must not advertise the public sitemap');
const sitemap = await readFile(new URL('sitemap.xml', dist), 'utf8');
if (!sitemap.includes('<sitemapindex') || !sitemap.includes('https://cartavault.fr/sitemap-0.xml')) throw new Error('sitemap.xml is not a valid complete sitemap index');
const sitemapEntries = await readFile(new URL('sitemap-0.xml', dist), 'utf8');
const sitemapUrls = [...sitemapEntries.matchAll(/<loc>(https:\/\/cartavault\.fr\/[^<]*)<\/loc>/g)].map((match) => match[1]);
if (sitemapUrls.length === 0 || new Set(sitemapUrls).size !== sitemapUrls.length) throw new Error('sitemap-0.xml is empty or contains duplicate URLs');
for (const excluded of ['https://cartavault.fr/', 'https://cartavault.fr/docs/', 'https://cartavault.fr/404/', 'https://cartavault.fr/500/']) {
  if (sitemapUrls.includes(excluded)) throw new Error(`sitemap-0.xml contains non-canonical route ${excluded}`);
}
for (const requiredUrl of ['https://cartavault.fr/fr/', 'https://cartavault.fr/en/', 'https://cartavault.fr/docs/fr/', 'https://cartavault.fr/docs/en/']) {
  if (!sitemapUrls.includes(requiredUrl)) throw new Error(`sitemap-0.xml is missing ${requiredUrl}`);
}
for (const file of ['404.html', '500.html']) {
  const html = await readFile(new URL(file, dist), 'utf8');
  if (!html.includes('name="robots" content="noindex,nofollow"')) throw new Error(`${file} must be excluded from indexing`);
  if (html.includes('rel="canonical"')) throw new Error(`${file} must not expose a canonical URL`);
}
for (const language of ['fr', 'en']) {
  const html = await readFile(new URL(`docs/${language}/index.html`, dist), 'utf8');
  if (indexable) {
    for (const hreflang of ['fr', 'en', 'x-default']) {
      if (!html.includes(`hreflang="${hreflang}"`)) throw new Error(`docs/${language}/index.html is missing ${hreflang} alternate`);
    }
  } else {
    if (!html.includes('name="robots" content="noindex,nofollow"')) throw new Error(`docs/${language}/index.html must not be indexed in preproduction`);
    if (html.includes('rel="canonical"')) throw new Error(`docs/${language}/index.html must not expose a canonical URL in preproduction`);
  }
}
const apacheConfig = await readFile(new URL('.htaccess', dist), 'utf8');
if (!indexable && !apacheConfig.includes('X-Robots-Tag "noindex, nofollow, noarchive"')) throw new Error('Preproduction Apache headers do not block indexing');
if (indexable && apacheConfig.includes('Header always set X-Robots-Tag "noindex')) throw new Error('Public Apache configuration sets a noindex header');
if (indexable && (!apacheConfig.includes('Header always unset X-Robots-Tag') || !apacheConfig.includes('Header onsuccess unset X-Robots-Tag'))) throw new Error('Public Apache configuration does not clear inherited X-Robots-Tag headers');
if (!apacheConfig.includes('RewriteRule ^$ /fr/ [R=301,L]') || !apacheConfig.includes('RewriteRule ^docs/?$ /docs/fr/ [R=301,L]')) throw new Error('Canonical language redirects are missing from Apache configuration');
for (const [language, opposite] of [['fr', 'en'], ['en', 'fr']]) {
  for (const route of ['index.html', 'features/index.html']) {
    const html = await readFile(new URL(`${language}/${route}`, dist), 'utf8');
    if (!html.includes(`app-places-${language}.`) || html.includes(`app-places-${opposite}.`)) {
      throw new Error(`${language}/${route} does not exclusively use ${language.toUpperCase()} product captures`);
    }
  }
}
for (const image of ['app-places-fr.webp', 'app-places-en.webp', 'cartavault-logo.png', '../favicon-v2.png', '../favicon.ico', '../apple-touch-icon.png']) {
  const details = await stat(new URL(`images/${image}`, dist));
  if (details.size > 750_000) throw new Error(`${image} exceeds the 750 KiB website budget`);
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    return entry.isDirectory() ? htmlFiles(url) : entry.name.endsWith('.html') ? [url] : [];
  }));
  return nested.flat();
}

for (const file of await htmlFiles(dist)) {
  if (file.pathname.endsWith('/404.html') || file.pathname.endsWith('/500.html')) continue;
  const html = await readFile(file, 'utf8');
  if (!indexable && !html.includes('name="robots" content="noindex,nofollow"')) {
    throw new Error(`${file.pathname} is indexable in the preproduction artifact`);
  }
  if (indexable && html.includes('name="robots" content="noindex,nofollow"')) {
    throw new Error(`${file.pathname} is unexpectedly excluded from the public index`);
  }
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((match) => match[1]);
  if (!indexable && canonicals.length > 0) throw new Error(`${file.pathname} exposes a canonical URL in preproduction`);
  if (indexable) {
    if (canonicals.length !== 1) throw new Error(`${file.pathname} must expose exactly one canonical URL`);
    if (!canonicals[0].startsWith('https://cartavault.fr/')) throw new Error(`${file.pathname} exposes a canonical URL on the wrong origin`);
  }
  for (const match of html.matchAll(/href="(\/[^"]*)"/g)) {
    const pathname = match[1].split(/[?#]/, 1)[0];
    if (!pathname || pathname.startsWith('/api/') || pathname.startsWith('/_astro/')) continue;
    const target = pathname.endsWith('/') ? `${pathname}index.html` : pathname.includes('.') ? pathname : `${pathname}/index.html`;
    try {
      await stat(new URL(`.${target}`, dist));
    } catch {
      throw new Error(`${file.pathname} contains a broken internal link to ${pathname}`);
    }
  }
}

if (indexable) {
  for (const url of sitemapUrls) {
    const pathname = new URL(url).pathname;
    const html = await readFile(new URL(`.${pathname}index.html`, dist), 'utf8');
    if (!html.includes(`<link rel="canonical" href="${url}"`)) throw new Error(`${url} is not self-canonical`);
    if (html.includes('noindex')) throw new Error(`${url} is both listed in the sitemap and excluded from indexing`);
  }
}

console.log('Static routes, metadata, internal links, search, and image budgets verified.');
