import {
	type APIInteraction,
	type APIInteractionResponse,
	InteractionResponseType,
	MessageFlags,
	PermissionFlagsBits,
} from 'discord-api-types/v10';
import type { Actor } from './types';

/** Permissions that let someone cancel a run they did not create. */
const MODERATOR_PERMISSIONS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageEvents;

function hasModeratorPermissions(permissions: string | undefined): boolean {
	if (!permissions) return false;
	try {
		return (BigInt(permissions) & MODERATOR_PERMISSIONS) !== 0n;
	} catch {
		return false;
	}
}

/**
 * Resolves who is acting. Guild interactions carry `member`; DM interactions
 * carry `user`. Prefer the guild nickname so the roster reads the way the guild
 * sees each other.
 */
export function getActor(interaction: APIInteraction): Actor | null {
	const user = interaction.member?.user ?? interaction.user;
	if (!user) return null;

	return {
		id: user.id,
		displayName: interaction.member?.nick ?? user.global_name ?? user.username,
		isAdmin: hasModeratorPermissions(interaction.member?.permissions),
	};
}

/** A private reply only the clicking user sees; used for every error path. */
export function ephemeral(content: string): APIInteractionResponse {
	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: { content, flags: MessageFlags.Ephemeral },
	};
}
