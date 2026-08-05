import { readFile, stat } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const required = ['index.html', 'fr/index.html', 'en/index.html', 'fr/features/index.html', 'en/features/index.html', '404.html', '500.html', 'robots.txt', 'sitemap.xml'];
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
console.log('Static routes, metadata and image budgets verified.');
