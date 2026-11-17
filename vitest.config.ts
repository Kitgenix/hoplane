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
          NOT_FOUND_URL: '',
          EXPIRED_LINK_RETENTION_DAYS: '',
          // Tests must not call GitHub; update-check tests stub fetch and turn it on.
          UPDATE_CHECK: 'false',
          HEALTH_CHECK_REQUESTS: '30',
          ACCESS_TEAM_DOMAIN: '',
          ACCESS_AUD: '',
          ACCESS_AUTO_ROLE: '',
        },
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
