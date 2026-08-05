import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware((context, next) => {
  const language = context.url.pathname.startsWith('/docs/fr/') ? 'fr' : 'en';
  context.locals.starlightRoute.lang = language;
  context.locals.starlightRoute.entryMeta.lang = language;
  return next();
});
