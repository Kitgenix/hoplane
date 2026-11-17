import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Pin every var so tests don't depend on how wrangler.jsonc is customised for a deployment.
        bindings: {
          SETUP_TOKEN: 'test-setup-token-123',
          SITE_NAME: 'Hoplane',
          HOME_URL: '',
          SLUG_LENGTH: '6',
          CASE_SENSITIVE: 'false',
          RETENTION_DAYS: '365',
        },
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
