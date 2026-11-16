import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { SETUP_TOKEN: 'test-setup-token-123', SITE_NAME: 'Hoplane' },
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
