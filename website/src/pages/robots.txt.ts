import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) => {
  const content = `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', site)}\n`;
  return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
