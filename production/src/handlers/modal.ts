import { type APIInteractionResponse, type APIModalSubmitInteraction, InteractionResponseType } from 'discord-api-types/v10';
import { MODAL_FIELD } from '../constants';
import { createGroup, setMessageId } from '../db';
import { fetchOriginalInteractionResponse } from '../discord';
import { buildGroupMessage } from '../embeds';
import type { Bindings } from '../env';
import { ephemeral, getActor } from '../interactions';
import { parseComposition, parseRole } from '../parse';
import { parseStartTime } from '../time';

/**
 * Walks a modal submission's component tree collecting each text `value` or
 * the first selected `values` entry by `custom_id`.
 *
 * Discord has shipped more than one nesting shape for modal components (plain
 * action rows, and label-wrapped inputs), so this recurses instead of assuming
 * a fixed depth.
 */
function collectModalValues(node: unknown, into: Map<string, string> = new Map()): Map<string, string> {
	if (Array.isArray(node)) {
		for (const child of node) collectModalValues(child, into);
		return into;
	}
	if (node === null || typeof node !== 'object') return into;

	const record = node as Record<string, unknown>;
	if (typeof record.custom_id === 'string') {
		if (typeof record.value === 'string') {
			into.set(record.custom_id, record.value);
		} else if (Array.isArray(record.values) && typeof record.values[0] === 'string') {
			into.set(record.custom_id, record.values[0]);
		}
	}
	if ('components' in record) collectModalValues(record.components, into);
	if ('component' in record) collectModalValues(record.component, into);
	return into;
}

export async function handleModalSubmit(
	interaction: APIModalSubmitInteraction,
	env: Bindings,
	ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
	const actor = getActor(interaction);
	if (!actor) return ephemeral('Could not identify you — try again.');
	if (!interaction.guild_id || !interaction.channel?.id) {
		return ephemeral('Mythic+ runs have to be posted in a server channel, not in DMs.');
	}

	const values = collectModalValues(interaction.data.components);
	const activity = (values.get(MODAL_FIELD.activity) ?? '').trim();
	if (!activity) return ephemeral('An activity is required — tell people what you are running.');

	const role = parseRole(values.get(MODAL_FIELD.role) ?? '');
	if (!role) {
		return ephemeral(`Could not read the role \`${values.get(MODAL_FIELD.role) ?? ''}\`. Enter **Tank**, **Healer**, or **DPS**.`);
	}

	const plan = parseComposition(values.get(MODAL_FIELD.comp) ?? '', role);
	if (!plan.ok) return ephemeral(plan.error);

	const startTime = parseStartTime(values.get(MODAL_FIELD.startTime) ?? '');
	if (!startTime.raw) return ephemeral('A start time is required.');

	const notes = (values.get(MODAL_FIELD.notes) ?? '').trim();
	const groupId = crypto.randomUUID();

	const state = await createGroup(env.DB, {
		id: groupId,
		guildId: interaction.guild_id,
		channelId: interaction.channel.id,
		creatorId: actor.id,
		creatorName: actor.displayName,
		creatorRole: role,
		activity,
		startTime: startTime.raw,
		startTs: startTime.ts,
		notes: notes || null,
		plan: plan.value,
		createdAt: Math.floor(Date.now() / 1000),
	});

	// The interaction response does not tell us the message id, and we need it so
	// the cron sweep can close the run out later. Fetch it after responding so the
	// user still gets their message inside Discord's 3 second window.
	ctx.waitUntil(captureMessageId(env, interaction.token, groupId));

	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: buildGroupMessage(state),
	};
}

async function captureMessageId(env: Bindings, interactionToken: string, groupId: string): Promise<void> {
	try {
		const message = await fetchOriginalInteractionResponse(env, interactionToken);
		if (message) await setMessageId(env.DB, groupId, message.id);
	} catch (error) {
		// Non-fatal: the run works fine, it just will not be edited on expiry.
		console.error(`Could not record message id for group ${groupId}`, error);
	}
}
