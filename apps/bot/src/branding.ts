/**
 * Every user-facing name the bot says out loud, in one place.
 *
 * The Discord application, the Worker, the D1 database, and the npm package
 * scope all keep their original `mplus-lfg` identifiers — renaming those would
 * break the existing installation. This module is only the display name, so a
 * later rebrand is a one-line change here rather than a grep across the repo.
 */
export const BRAND = {
	/** Display name used in copy, embeds, and confirmations. */
	name: 'Guild Helper',
	/** One-line description of what the bot is for. */
	tagline: 'a World of Warcraft guild helper for Discord',
} as const;
