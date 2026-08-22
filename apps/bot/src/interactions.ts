import {
	type APIInteraction,
	type APIInteractionResponse,
	InteractionResponseType,
	MessageFlags,
	PermissionFlagsBits,
} from 'discord-api-types/v10';
import type { Actor } from './types';

/** Permissions that let someone act on a post they did not create. */
const MODERATOR_PERMISSIONS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageEvents;
const SETUP_PERMISSIONS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild;

function hasAnyPermission(permissions: string | undefined, required: bigint): boolean {
	if (!permissions) return false;
	try {
		return (BigInt(permissions) & required) !== 0n;
	} catch {
		return false;
	}
}

/** Runtime defence for setup/settings in addition to command registration permissions. */
export function canManageGuild(interaction: APIInteraction): boolean {
	return hasAnyPermission(interaction.member?.permissions, SETUP_PERMISSIONS);
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
		isAdmin: hasAnyPermission(interaction.member?.permissions, MODERATOR_PERMISSIONS),
		roleIds: interaction.member?.roles ?? [],
	};
}

/** A private reply only the clicking user sees; used for every error path. */
export function ephemeral(content: string): APIInteractionResponse {
	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: { content, flags: MessageFlags.Ephemeral },
	};
}

/**
 * A private "thinking…" placeholder, acknowledging inside Discord's 3 second
 * window so slower work (an item metadata lookup, a post to the channel) can
 * happen afterwards and edit this response when it finishes.
 */
export function deferEphemeral(): APIInteractionResponse {
	return {
		type: InteractionResponseType.DeferredChannelMessageWithSource,
		data: { flags: MessageFlags.Ephemeral },
	};
}

/** Ephemeral message body for editing a deferred response after the fact. */
export function ephemeralBody(content: string): Record<string, unknown> {
	return { content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } };
}
