import {
	type APIActionRowComponent,
	type APIButtonComponent,
	type APIEmbed,
	type APIEmbedField,
	type APIMessageTopLevelComponent,
	ButtonStyle,
	ComponentType,
} from 'discord-api-types/v10';
import { CRAFT_STATUS_META, QUALITY_COLOR } from './constants';
import { craftButtonId } from './customId';
import type { CraftRequestRow } from './types';

/**
 * Pure renderers: given a committed row, produce the embed and buttons. Nothing
 * here touches D1 or the network, so the message is identical whether it comes
 * from the create flow, a button press, or the cron sweep.
 */

/** Discord's hard limits; exceeding any of them rejects the whole message. */
const LIMIT = { title: 256, description: 4096, fieldValue: 1024 } as const;

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Neutralises the markdown and mention syntax in text a requester typed, so a
 * character name or a note cannot forge a heading, a link, or a fake mention.
 * `allowed_mentions` already stops any of it from pinging; this keeps it from
 * *looking* like something it is not.
 */
function plain(text: string): string {
	return text.replace(/[\\`*_~|>#\-[\]()]/g, (character) => `\\${character}`).replace(/@/g, '@​');
}

export function itemLabel(request: CraftRequestRow): string {
	const name = request.item_name ?? `WoW Item #${request.item_id}`;
	return request.quantity > 1 ? `${name} ×${request.quantity}` : name;
}

function statusLine(request: CraftRequestRow): string {
	const status = CRAFT_STATUS_META[request.status];
	return `${status.emoji} ${status.label}`;
}

export function buildCraftEmbed(request: CraftRequestRow): APIEmbed {
	const status = CRAFT_STATUS_META[request.status];

	const description = [
		`**Status** ${statusLine(request)}`,
		`**Requested by** <@${request.requester_id}>`,
		request.crafter_id ? `**Crafter** <@${request.crafter_id}>` : null,
		request.status === 'COMPLETED' && request.completed_at ? `**Completed** <t:${request.completed_at}:R>` : null,
	]
		.filter((line): line is string => line !== null)
		.join('\n');

	const fields: APIEmbedField[] = [{ name: 'Quantity', value: `×${request.quantity}`, inline: true }];
	if (request.character_realm) {
		fields.push({ name: 'Character', value: truncate(plain(request.character_realm), LIMIT.fieldValue), inline: true });
	}
	if (request.details) {
		fields.push({ name: 'Request details', value: truncate(plain(request.details), LIMIT.fieldValue), inline: false });
	}

	return {
		title: truncate(`${status.emoji} ${itemLabel(request)}`, LIMIT.title),
		// A completed or cancelled request keeps the status colour; a live one is
		// tinted by item quality when we managed to resolve it.
		color:
			request.status === 'OPEN' && request.item_quality
				? (QUALITY_COLOR[request.item_quality] ?? status.color)
				: status.color,
		description: truncate(description, LIMIT.description),
		fields,
		...(request.item_icon ? { thumbnail: { url: request.item_icon } } : {}),
		footer: { text: `Request ${request.id.slice(0, 8)}` },
		timestamp: new Date(request.created_at * 1000).toISOString(),
	};
}

/**
 * Only the buttons that make sense for the current state.
 *
 * Terminal states drop their mutation buttons entirely rather than showing them
 * greyed out: there is nothing left to do, and a disabled row invites clicks on
 * a request that no longer exists.
 */
export function buildCraftComponents(request: CraftRequestRow): APIActionRowComponent<APIButtonComponent>[] {
	const buttons: APIButtonComponent[] = [];

	if (request.status === 'OPEN') {
		buttons.push({
			type: ComponentType.Button,
			style: ButtonStyle.Success,
			label: "I'll craft it",
			emoji: { name: '🔨' },
			custom_id: craftButtonId('claim', request.id),
		});
	}
	if (request.status === 'CLAIMED') {
		buttons.push(
			{
				type: ComponentType.Button,
				style: ButtonStyle.Primary,
				label: 'Mark complete',
				emoji: { name: '✅' },
				custom_id: craftButtonId('complete', request.id),
			},
			{
				type: ComponentType.Button,
				style: ButtonStyle.Secondary,
				label: 'Release claim',
				emoji: { name: '↩️' },
				custom_id: craftButtonId('release', request.id),
			},
		);
	}
	if (request.status === 'OPEN' || request.status === 'CLAIMED') {
		buttons.push({
			type: ComponentType.Button,
			style: ButtonStyle.Danger,
			label: 'Cancel request',
			emoji: { name: '❌' },
			custom_id: craftButtonId('cancel', request.id),
		});
	}

	// The link button is always present: looking the item up stays useful long
	// after the request itself is closed.
	buttons.push({
		type: ComponentType.Button,
		style: ButtonStyle.Link,
		label: 'View on Wowhead',
		url: request.item_url,
	});

	return [{ type: ComponentType.ActionRow, components: buttons }];
}

export interface CraftMessagePayload {
	embeds: APIEmbed[];
	components: APIMessageTopLevelComponent[];
	/** Requester and crafter render as names without pinging anyone. */
	allowed_mentions: { parse: [] };
}

export function buildCraftMessage(request: CraftRequestRow): CraftMessagePayload {
	return {
		embeds: [buildCraftEmbed(request)],
		components: buildCraftComponents(request),
		allowed_mentions: { parse: [] },
	};
}

/** Jump link to the public post, when we know where it ended up. */
export function craftJumpLink(request: CraftRequestRow): string | null {
	if (!request.message_id) return null;
	return `https://discord.com/channels/${request.guild_id}/${request.channel_id}/${request.message_id}`;
}
