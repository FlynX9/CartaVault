// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { functionalSidebar } from './src/generated/functionalSidebar.mjs';

const canonicalRedirects = new Set([
  'https://cartavault.fr/',
  'https://cartavault.fr/docs/',
]);

export default defineConfig({
  site: 'https://cartavault.fr',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({ filter: (page) => !canonicalRedirects.has(page) }),
    starlight({
      title: 'CartaVault Docs',
      description: 'Guides utilisateur, administration et références techniques CartaVault.',
      favicon: '/favicon.ico',
      logo: {
        src: './public/images/cartavault-logo.png',
        alt: 'CartaVault',
        replacesTitle: true,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/FlynX9/CartaVault' },
      ],
      customCss: ['./src/styles/starlight.css'],
      lastUpdated: true,
      disable404Route: true,
      routeMiddleware: './src/starlightRouteData.ts',
      sidebar: [
        { label: 'CartaVault.fr', link: '/fr/' },
        {
          label: 'Français',
          items: [
            { label: 'Accueil de la documentation', link: '/docs/fr/' },
            ...functionalSidebar.fr,
            {
              label: 'Guides transversaux', collapsed: true, items: [
                { label: 'Interface desktop', link: '/docs/fr/interface-desktop/' },
                { label: 'Interface mobile', link: '/docs/fr/interface-mobile/' },
                { label: 'Dépannage', link: '/docs/fr/troubleshooting/' },
                { label: 'Référence technique', items: [{ autogenerate: { directory: 'docs/fr/reference' } }] },
              ],
            },
          ],
        },
        {
          label: 'English',
          items: [
            { label: 'Documentation home', link: '/docs/en/' },
            ...functionalSidebar.en,
            {
              label: 'Cross-cutting guides', collapsed: true, items: [
                { label: 'Desktop interface', link: '/docs/en/interface-desktop/' },
                { label: 'Mobile interface', link: '/docs/en/interface-mobile/' },
                { label: 'Troubleshooting', link: '/docs/en/troubleshooting/' },
                { label: 'Technical reference', items: [{ autogenerate: { directory: 'docs/en/reference' } }] },
              ],
            },
          ],
        },
        { label: 'GitHub', link: 'https://github.com/FlynX9/CartaVault' },
        { label: 'Mentions légales · Legal', link: '/fr/legal/' },
      ],
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0a9f88' } },
      ],
    }),
  ],
});
