import { readFile, readdir, stat } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const required = ['index.html', 'fr/index.html', 'en/index.html', 'fr/features/index.html', 'en/features/index.html', 'docs/index.html', 'docs/fr/index.html', 'docs/en/index.html', 'docs/fr/trips/index.html', 'docs/en/trips/index.html', 'docs/openapi.json', 'pagefind/pagefind.js', '404.html', '500.html', 'robots.txt', 'sitemap.xml'];
for (const file of required) await stat(new URL(file, dist));
const pages = ['fr/index.html', 'en/index.html', 'fr/legal/index.html', 'en/privacy/index.html'];
for (const file of pages) {
  const html = await readFile(new URL(file, dist), 'utf8');
  for (const marker of ['<title>', 'rel="canonical"', 'property="og:title"', 'application/ld+json']) {
    if (!html.includes(marker)) throw new Error(`${file} is missing ${marker}`);
  }
}
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

console.log('Static routes, metadata, internal links, search, and image budgets verified.');
