// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://panoramicireland.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  image: {
    // Responsive WebP pipeline handled at build/upload time (mozjpeg + srcset)
    domains: [],
  },
  vite: {
    ssr: {
      external: ['node:buffer'],
    },
  },
});
