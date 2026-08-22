import {
	type APIInteractionResponse,
	type APIModalSubmitInteraction,
	ChannelType,
	InteractionResponseType,
	MessageFlags,
} from 'discord-api-types/v10';
import {
	isOfferedTimezone,
	MODAL_SETUP_ID,
	SETUP_CHANNEL_FIELD,
	SETUP_CRAFTER_ROLE_FIELD,
	SETUP_CRAFT_CHANNEL_FIELD,
	SETUP_TIMEZONE_FIELD,
} from '../constants';
import { MODAL_CRAFT_ID } from '../craft/constants';
import { handleCraftModalSubmit } from '../craft/flow';
import { fetchOriginalInteractionResponse } from '../discord';
import type { Bindings } from '../env';
import { getGuildConfig, setGuildConfig } from '../guildConfig';
import { canManageGuild, ephemeral, getActor } from '../interactions';
import { requireLfgChannel } from '../lfg/access';
import { DEFAULT_ROLE, MODAL_CREATE_ID, MODAL_FIELD } from '../lfg/constants';
import { createGroup, setMessageId } from '../lfg/db';
import { buildGroupMessage } from '../lfg/embeds';
import { parseComposition, parseRole } from '../lfg/parse';
import { collectModalSelections, collectModalValues } from '../modalValues';
import { parseStartTime } from '../time';

export async function handleModalSubmit(
	interaction: APIModalSubmitInteraction,
	env: Bindings,
	ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
	const values = collectModalValues(interaction.data.components);

	switch (interaction.data.custom_id) {
		case MODAL_SETUP_ID:
			return handleConfigurationSubmit(interaction, env, values);
		case MODAL_CRAFT_ID:
			return handleCraftModalSubmit(interaction, env, ctx, values);
		case MODAL_CREATE_ID:
			return handleGroupSubmit(interaction, env, ctx, values);
		default:
			return ephemeral('That form is no longer supported.');
	}
}

async function handleGroupSubmit(
	interaction: APIModalSubmitInteraction,
	env: Bindings,
	ctx: ExecutionContext,
	values: Map<string, string>,
): Promise<APIInteractionResponse> {
	const actor = getActor(interaction);
	if (!actor) return ephemeral('Could not identify you — try again.');

	const access = await requireLfgChannel(interaction, env.DB);
	if (!access.allowed) return access.response;

	const activity = (values.get(MODAL_FIELD.activity) ?? '').trim();
	if (!activity) return ephemeral('An activity is required — tell people what you are running.');

	const submittedRole = values.get(MODAL_FIELD.role);
	const role = parseRole(submittedRole ?? DEFAULT_ROLE);
	if (!role) {
		return ephemeral(`Could not read the role \`${submittedRole ?? ''}\`. Select **Tank**, **Healer**, or **DPS**.`);
	}

	const plan = parseComposition(values.get(MODAL_FIELD.comp) ?? '', role);
	if (!plan.ok) return ephemeral(plan.error);

	const startTime = parseStartTime(values.get(MODAL_FIELD.startTime) ?? '', { timezone: access.timezone });
	if (!startTime.raw) return ephemeral('A start time is required.');

	const notes = (values.get(MODAL_FIELD.notes) ?? '').trim();
	const groupId = crypto.randomUUID();

	const state = await createGroup(env.DB, {
		id: groupId,
		guildId: access.guildId,
		channelId: access.channelId,
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

/**
 * Saves every server setting from one modal.
 *
 * The stored row is read first and used as the base, so a field the admin did
 * not touch keeps its value. The two optional pickers distinguish "left alone"
 * from "cleared" by whether they were submitted at all, which is the only way
 * to turn crafting or the crafter role back off.
 */
async function handleConfigurationSubmit(
	interaction: APIModalSubmitInteraction,
	env: Bindings,
	values: Map<string, string>,
): Promise<APIInteractionResponse> {
	if (!interaction.guild_id) return ephemeral('Server setup is only available inside a server.');
	if (!canManageGuild(interaction)) {
		return ephemeral('You need **Manage Server** or **Administrator** permission to configure this bot.');
	}

	const selections = collectModalSelections(interaction.data.components);
	const existing = await getGuildConfig(env.DB, interaction.guild_id);

	const channelId = values.get(SETUP_CHANNEL_FIELD);
	if (!channelId) return ephemeral('Choose a text channel before saving LFG setup.');
	if (!isSelectedTextChannel(interaction, channelId)) {
		return ephemeral('Choose a server text channel for LFG activity.');
	}

	// Validate what was submitted, but trust what is already stored: the offered
	// list can change, and an admin whose saved zone dropped off it must still be
	// able to reopen /settings and change the channel.
	const submittedZone = values.get(SETUP_TIMEZONE_FIELD);
	if (submittedZone !== undefined && !isOfferedTimezone(submittedZone)) {
		return ephemeral('Choose a timezone before saving LFG setup.');
	}
	// An untouched select submits nothing at all.
	const timezone = submittedZone ?? existing?.timezone;
	if (timezone === undefined) {
		return ephemeral('Choose a timezone before saving LFG setup.');
	}

	const craftChannelId = resolveOptionalSelection(selections, SETUP_CRAFT_CHANNEL_FIELD, existing?.craft_channel_id ?? null);
	if (craftChannelId && !isSelectedTextChannel(interaction, craftChannelId)) {
		return ephemeral('Choose a server text channel for crafting requests.');
	}
	if (craftChannelId && craftChannelId === channelId) {
		return ephemeral('Use a different channel for crafting requests so the two features do not collide.');
	}

	const crafterRoleId = resolveOptionalSelection(selections, SETUP_CRAFTER_ROLE_FIELD, existing?.crafter_role_id ?? null);

	await setGuildConfig(env.DB, {
		guildId: interaction.guild_id,
		channelId,
		timezone,
		craftChannelId,
		crafterRoleId,
	});

	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: confirmation({ channelId, timezone, craftChannelId, crafterRoleId }),
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] },
		},
	};
}

/** Present but empty means the admin cleared it; absent means leave it alone. */
function resolveOptionalSelection(selections: Map<string, string[]>, field: string, current: string | null): string | null {
	const submitted = selections.get(field);
	if (submitted === undefined) return current;
	return submitted[0] ?? null;
}

/** Never trust the id alone: `resolved` is what says which channel it really is. */
function isSelectedTextChannel(interaction: APIModalSubmitInteraction, channelId: string): boolean {
	const channel = interaction.data.resolved?.channels?.[channelId];
	return channel?.type === ChannelType.GuildText;
}

interface Confirmation {
	channelId: string;
	timezone: string;
	craftChannelId: string | null;
	crafterRoleId: string | null;
}

function confirmation(saved: Confirmation): string {
	return [
		'Setup complete!',
		`• LFG posts will use <#${saved.channelId}>, and start times will be read as **${saved.timezone}**.`,
		saved.craftChannelId
			? `• Crafting requests will use <#${saved.craftChannelId}>.`
			: '• Crafting is off. Choose a crafting channel in `/settings` to turn it on.',
		saved.crafterRoleId
			? `• Only <@&${saved.crafterRoleId}> can claim crafting requests.`
			: '• Anyone can claim a crafting request.',
	].join('\n');
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
