import type { APIRoute } from 'astro';
import { languages, pageSlugs } from '../content/site';
export const GET: APIRoute = ({ site }) => {
  const paths = languages.flatMap((lang) => ['', ...pageSlugs].map((slug) => `/${lang}/${slug ? `${slug}/` : ''}`));
  const urls = paths.map((path) => `<url><loc>${new URL(path, site)}</loc><changefreq>weekly</changefreq></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
