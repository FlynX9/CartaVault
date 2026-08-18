import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { isIndexableDeployment } from './seo';

export const onRequest = defineRouteMiddleware((context, next) => {
  const pathname = context.url.pathname;
  const language = pathname.startsWith('/docs/fr/') ? 'fr' : 'en';
  context.locals.starlightRoute.lang = language;
  context.locals.starlightRoute.entryMeta.lang = language;
  context.locals.starlightRoute.sidebar = context.locals.starlightRoute.sidebar
    .filter((entry) => entry.type !== 'group' || entry.label !== (language === 'fr' ? 'English' : 'Français'))
    .map((entry) => entry.type === 'group' && ['Français', 'English'].includes(entry.label)
      ? { ...entry, label: language === 'fr' ? 'Documentation' : 'Documentation' }
      : entry);
  const suffix = pathname.replace(/^\/docs\/(?:fr|en)\//, '');
  const site = context.url.origin;
  context.locals.starlightRoute.head = context.locals.starlightRoute.head.filter(({ tag, attrs }) => {
    if (tag !== 'link') return true;
    if (attrs?.rel === 'alternate' || attrs?.rel === 'sitemap') return false;
    return isIndexableDeployment || attrs?.rel !== 'canonical';
  });
  if (isIndexableDeployment) {
    context.locals.starlightRoute.head.push(
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'fr', href: new URL(`/docs/fr/${suffix}`, site).href } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'en', href: new URL(`/docs/en/${suffix}`, site).href } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: new URL(`/docs/fr/${suffix}`, site).href } },
    );
  } else {
    context.locals.starlightRoute.head.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex,nofollow' } });
  }
  context.locals.starlightRoute.head.push({ tag: 'link', attrs: { rel: 'sitemap', href: '/sitemap.xml' } });
  return next();
});
