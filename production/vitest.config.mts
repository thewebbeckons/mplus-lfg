import { readFileSync } from 'node:fs';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		// discord-api-types ships an .mjs that re-exports a .cjs; the Workers
		// runtime cannot resolve that on its own, so pre-bundle it.
		// https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution
		deps: {
			optimizer: {
				// The package exposes no "." entry point, so name the subpath.
				ssr: { enabled: true, include: ['discord-api-types/v10'] },
			},
		},
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						// Single source of truth for the schema: tests apply the same
						// file `wrangler d1 execute` does.
						SCHEMA_SQL: readFileSync('./schema.sql', 'utf8'),
						// Placeholder secrets. Tests that exercise signature verification
						// overwrite DISCORD_PUBLIC_KEY with a freshly generated key.
						DISCORD_PUBLIC_KEY: '',
						DISCORD_APPLICATION_ID: '000000000000000001',
						DISCORD_TOKEN: 'test-token',
					},
				},
			},
		},
	},
});
