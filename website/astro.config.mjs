// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cartavault.fr',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
