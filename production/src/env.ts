/**
 * Worker bindings.
 *
 * Declared by hand rather than relying on `wrangler types` so that the three
 * Discord secrets (which never appear in `wrangler.jsonc`) are type-checked too.
 */
export interface Bindings {
	/** D1 database holding `mplus_groups` / `mplus_signups`. */
	DB: D1Database;
	/** Ed25519 public key from the Discord developer portal, hex encoded. */
	DISCORD_PUBLIC_KEY: string;
	/** Discord application (client) ID. */
	DISCORD_APPLICATION_ID: string;
	/** Bot token, used only by the cron sweep to edit expired run messages. */
	DISCORD_TOKEN: string;
}
