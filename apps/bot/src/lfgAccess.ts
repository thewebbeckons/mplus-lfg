import type { APIInteraction, APIInteractionResponse } from 'discord-api-types/v10';
import { getGuildConfig } from './db';
import { ephemeral } from './interactions';

interface InteractionLocation {
	guild_id?: string;
	channel?: { id: string } | null;
	channel_id?: string;
}

export type LfgAccess =
	| { allowed: true; guildId: string; channelId: string; timezone: string }
	| { allowed: false; response: APIInteractionResponse };

/**
 * Reads D1 for every LFG entry point so settings changes take effect
 * immediately and the configured channel remains the server-side authority.
 */
export async function requireLfgChannel(interaction: APIInteraction & InteractionLocation, db: D1Database): Promise<LfgAccess> {
	if (!interaction.guild_id) {
		return {
			allowed: false,
			response: ephemeral('Mythic+ runs have to be used in a server channel, not in DMs.'),
		};
	}

	const config = await getGuildConfig(db, interaction.guild_id);
	if (!config) {
		return {
			allowed: false,
			response: ephemeral("This server hasn't finished LFG setup yet. A server admin can run `/setup` to get started."),
		};
	}

	const currentChannelId = interaction.channel?.id ?? interaction.channel_id;
	if (currentChannelId !== config.channel_id) {
		return {
			allowed: false,
			response: ephemeral(
				`LFG commands are available in <#${config.channel_id}>. Head over there to create or browse groups.`,
			),
		};
	}

	return { allowed: true, guildId: config.guild_id, channelId: config.channel_id, timezone: config.timezone };
}
