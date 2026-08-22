import type { APIInteraction, APIInteractionResponse } from 'discord-api-types/v10';

/**
 * Shared shape for "is this interaction allowed to run here?".
 *
 * Every feature entry point re-reads D1 rather than trusting the channel the
 * interaction arrived in, so a settings change takes effect immediately and the
 * configured channel stays the server-side authority.
 */

/** The two places Discord reports the originating channel, depending on payload age. */
export interface InteractionLocation {
	guild_id?: string;
	channel?: { id: string } | null;
	channel_id?: string;
}

export type Access<T> = ({ allowed: true } & T) | { allowed: false; response: APIInteractionResponse };

export function channelIdOf(interaction: APIInteraction & InteractionLocation): string | undefined {
	return interaction.channel?.id ?? interaction.channel_id;
}
