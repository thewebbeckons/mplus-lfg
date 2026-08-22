/**
 * Per-server configuration, shared by every feature.
 *
 * The table started life as LFG-only, so `channel_id` is the LFG channel and
 * keeps that name. Crafting adds two nullable columns rather than a second
 * table: a guild that only ever configured LFG reads back exactly as before,
 * with the new fields null.
 */

/** Row shape of `mplus_guild_config`. */
export interface GuildConfigRow {
	guild_id: string;
	/** LFG channel. Required — the column predates the crafting feature. */
	channel_id: string;
	/** IANA zone name, e.g. `America/Toronto`. */
	timezone: string;
	/** Crafting channel, or null when crafting has not been set up. */
	craft_channel_id: string | null;
	/** Role allowed to claim crafting requests, or null when anyone may claim. */
	crafter_role_id: string | null;
}

const SELECT_SQL = `SELECT guild_id, channel_id, timezone, craft_channel_id, crafter_role_id
	FROM mplus_guild_config WHERE guild_id = ?1`;

export async function getGuildConfig(db: D1Database, guildId: string): Promise<GuildConfigRow | null> {
	return db.prepare(SELECT_SQL).bind(guildId).first<GuildConfigRow>();
}

/** The full desired configuration. Callers merge with the stored row first. */
export interface GuildConfigInput {
	guildId: string;
	channelId: string;
	timezone: string;
	craftChannelId?: string | null;
	crafterRoleId?: string | null;
}

/**
 * Writes the whole row. `/setup` and `/settings` always compute the complete
 * configuration — stored values merged with whatever the admin changed — so a
 * full upsert cannot silently drop a field the modal did not touch.
 */
export async function setGuildConfig(db: D1Database, input: GuildConfigInput): Promise<void> {
	await db
		.prepare(
			`INSERT INTO mplus_guild_config (guild_id, channel_id, timezone, craft_channel_id, crafter_role_id)
			 VALUES (?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT (guild_id) DO UPDATE SET
				channel_id = excluded.channel_id,
				timezone = excluded.timezone,
				craft_channel_id = excluded.craft_channel_id,
				crafter_role_id = excluded.crafter_role_id`,
		)
		.bind(input.guildId, input.channelId, input.timezone, input.craftChannelId ?? null, input.crafterRoleId ?? null)
		.run();
}
