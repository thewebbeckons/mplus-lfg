import type { APIInteraction } from 'discord-api-types/v10';
import { type Access, channelIdOf, type InteractionLocation } from '../access';
import { getGuildConfig } from '../guildConfig';
import { ephemeral } from '../interactions';
import type { Actor } from '../types';

export type CraftAccess = Access<{ guildId: string; channelId: string; crafterRoleId: string | null }>;

/**
 * Reads D1 for every crafting entry point, so a channel change takes effect
 * immediately and buttons on posts in the old channel stop mutating anything.
 */
export async function requireCraftChannel(
	interaction: APIInteraction & InteractionLocation,
	db: D1Database,
): Promise<CraftAccess> {
	if (!interaction.guild_id) {
		return { allowed: false, response: ephemeral('Crafting requests have to be used in a server channel, not in DMs.') };
	}

	const config = await getGuildConfig(db, interaction.guild_id);
	if (!config?.craft_channel_id) {
		return {
			allowed: false,
			response: ephemeral(
				'Crafting is not set up in this server yet. A server admin can run `/setup` (or `/settings`) and choose a crafting channel.',
			),
		};
	}

	if (channelIdOf(interaction) !== config.craft_channel_id) {
		return {
			allowed: false,
			response: ephemeral(`Crafting requests live in <#${config.craft_channel_id}>. Head over there to post or claim one.`),
		};
	}

	return {
		allowed: true,
		guildId: config.guild_id,
		channelId: config.craft_channel_id,
		crafterRoleId: config.crafter_role_id,
	};
}

/**
 * Who may claim a request.
 *
 * With no crafter role configured, anybody in the server can pick one up. With
 * one configured, it is the role holders plus the moderators who could override
 * it anyway.
 */
export function canClaim(actor: Actor, crafterRoleId: string | null): boolean {
	if (!crafterRoleId) return true;
	return actor.isAdmin || actor.roleIds.includes(crafterRoleId);
}
