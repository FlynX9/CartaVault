import type { APIRoute } from 'astro';
import { isIndexableDeployment } from '../seo';
export const GET: APIRoute = ({ site }) => {
  const sitemap = isIndexableDeployment ? `Sitemap: ${new URL('/sitemap.xml', site)}\n` : '';
  const content = `User-agent: *\nAllow: /\n${sitemap}`;
  return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
