/**
 * Hoplane frontend and Cloudflare Worker build configuration.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * The Cloudflare Vite plugin reads wrangler.jsonc and generates deployment
 * configuration for the built Worker and dashboard assets. Keep routing and
 * bindings in wrangler.jsonc rather than duplicating them here.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    // Warning threshold only; this does not reduce JavaScript bundle size.
    chunkSizeWarningLimit: 900,
  },
});
