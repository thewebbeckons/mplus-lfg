import type { Bindings } from '../src/env';

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Bindings {
		/** Contents of schema.sql, injected by vitest.config.mts. */
		SCHEMA_SQL: string;
	}
}
