/**
 * Worker bindings.
 *
 * Declared by hand rather than relying on `wrangler types` so that the secrets
 * (which never appear in `wrangler.jsonc`) are type-checked too.
 */
export interface Bindings {
	/** D1 database holding guild configuration, groups, signups, and craft requests. */
	DB: D1Database;
	/** Ed25519 public key from the Discord developer portal, hex encoded. */
	DISCORD_PUBLIC_KEY: string;
	/** Discord application (client) ID. */
	DISCORD_APPLICATION_ID: string;
	/** Bot token, used for the cron sweep, follow-up posts, and completion DMs. */
	DISCORD_TOKEN: string;
	/**
	 * Battle.net API client credentials, used only to resolve an item's name,
	 * icon, and quality for crafting requests.
	 *
	 * Optional on purpose: without them `/craft` still works and falls back to
	 * the name in the Wowhead URL. Never log or echo these back to Discord.
	 */
	BLIZZARD_CLIENT_ID?: string;
	BLIZZARD_CLIENT_SECRET?: string;
}
