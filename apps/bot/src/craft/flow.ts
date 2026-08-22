import {
	type APIInteractionResponse,
	type APILabelComponent,
	type APIMessageComponentInteraction,
	type APIModalSubmitInteraction,
	ComponentType,
	InteractionResponseType,
	TextInputStyle,
} from 'discord-api-types/v10';
import { editOriginalInteractionResponse, createFollowupMessage } from '../discord';
import type { Bindings } from '../env';
import { deferEphemeral, ephemeral, ephemeralBody, getActor } from '../interactions';
import type { Actor } from '../types';
import { canClaim, requireCraftChannel } from './access';
import { CRAFT_FIELD, CRAFT_LIMIT, MODAL_CRAFT_ID } from './constants';
import { parseCraftComponentId } from './customId';
import {
	type ClaimOutcome,
	type CompleteOutcome,
	type CraftCancelOutcome,
	type CraftMutationResult,
	type ReleaseOutcome,
	cancelCraftRequest,
	claimCraftRequest,
	completeCraftRequest,
	createCraftRequest,
	deleteCraftRequest,
	releaseCraftRequest,
	setCraftMessageId,
} from './db';
import { buildCraftMessage } from './embeds';
import { fetchItemMetadata } from './itemMetadata';
import { notifyRequesterOfCompletion } from './notify';
import { optionalText, parseQuantity } from './parse';
import { type WowheadItemLink, fallbackItemName, parseWowheadItemUrl } from './wowhead';

/**
 * `/craft` end to end: the modal, the request it creates, and the buttons that
 * move it through its lifecycle.
 */

const CRAFT_MODAL_COMPONENTS: APILabelComponent[] = [
	{
		type: ComponentType.Label,
		label: 'Wowhead item link',
		description: 'Paste the Retail Wowhead page for the item, e.g. wowhead.com/item=222441',
		component: {
			type: ComponentType.TextInput,
			custom_id: CRAFT_FIELD.itemUrl,
			placeholder: 'https://www.wowhead.com/item=222441/charged-claw',
			style: TextInputStyle.Short,
			required: true,
			max_length: CRAFT_LIMIT.itemUrl,
		},
	},
	{
		type: ComponentType.Label,
		label: 'Quantity (optional)',
		description: 'Defaults to 1.',
		component: {
			type: ComponentType.TextInput,
			custom_id: CRAFT_FIELD.quantity,
			placeholder: '1',
			style: TextInputStyle.Short,
			required: false,
			max_length: CRAFT_LIMIT.quantity,
		},
	},
	{
		type: ComponentType.Label,
		label: 'Character and realm (optional)',
		description: 'Who the crafter should send it to.',
		component: {
			type: ComponentType.TextInput,
			custom_id: CRAFT_FIELD.character,
			placeholder: 'Ashwynn — Area 52',
			style: TextInputStyle.Short,
			required: false,
			max_length: CRAFT_LIMIT.character,
		},
	},
	{
		type: ComponentType.Label,
		label: 'Request details (optional)',
		description: 'Quality/rank, embellishment, mats supplied, tip, deadline…',
		component: {
			type: ComponentType.TextInput,
			custom_id: CRAFT_FIELD.details,
			placeholder: 'Rank 3 if possible, I have the mats, happy to tip 5k. Needed before raid Thursday.',
			style: TextInputStyle.Paragraph,
			required: false,
			max_length: CRAFT_LIMIT.details,
		},
	},
];

export function craftRequestModal(): APIInteractionResponse {
	return {
		type: InteractionResponseType.Modal,
		data: {
			custom_id: MODAL_CRAFT_ID,
			title: 'Request a craft',
			components: CRAFT_MODAL_COMPONENTS,
		},
	};
}

/**
 * Handles the submitted form.
 *
 * Everything that can reject the submission happens *locally* and before the
 * response: the URL shape, the quantity, the field lengths, and the channel
 * gate are all decided without a network call, so an invalid request gets an
 * immediate ephemeral error rather than a spinner. Only once the submission is
 * known to be good do we defer, and only then does the item metadata lookup and
 * the public post happen.
 */
export async function handleCraftModalSubmit(
	interaction: APIModalSubmitInteraction,
	env: Bindings,
	ctx: ExecutionContext,
	values: Map<string, string>,
): Promise<APIInteractionResponse> {
	const actor = getActor(interaction);
	if (!actor) return ephemeral('Could not identify you — try again.');

	const access = await requireCraftChannel(interaction, env.DB);
	if (!access.allowed) return access.response;

	const link = parseWowheadItemUrl(values.get(CRAFT_FIELD.itemUrl) ?? '');
	if (!link.ok) return ephemeral(link.error);

	const quantity = parseQuantity(values.get(CRAFT_FIELD.quantity));
	if (!quantity.ok) return ephemeral(quantity.error);

	const character = optionalText(values.get(CRAFT_FIELD.character), CRAFT_LIMIT.character);
	if (!character.ok) return ephemeral(character.error);

	const details = optionalText(values.get(CRAFT_FIELD.details), CRAFT_LIMIT.details);
	if (!details.ok) return ephemeral(details.error);

	ctx.waitUntil(
		publishCraftRequest(env, interaction.token, {
			guildId: access.guildId,
			channelId: access.channelId,
			actor,
			link: link.value,
			quantity: quantity.value,
			characterRealm: character.value,
			details: details.value,
		}),
	);

	return deferEphemeral();
}

interface PendingCraftRequest {
	guildId: string;
	channelId: string;
	actor: Actor;
	link: WowheadItemLink;
	quantity: number;
	characterRealm: string | null;
	details: string | null;
}

/**
 * The part that runs after the interaction has already been acknowledged.
 *
 * Every exit path edits the deferred response, including the failure ones —
 * leaving it untouched is what leaves the requester staring at a loading
 * indicator until Discord gives up on it.
 */
async function publishCraftRequest(env: Bindings, interactionToken: string, pending: PendingCraftRequest): Promise<void> {
	const requestId = crypto.randomUUID();

	try {
		// Best effort by design: no credentials, a timeout, or an id that is not a
		// real item all come back as nulls rather than failing the request.
		const metadata = await fetchItemMetadata(env, pending.link.itemId);

		const request = await createCraftRequest(env.DB, {
			id: requestId,
			guildId: pending.guildId,
			channelId: pending.channelId,
			requesterId: pending.actor.id,
			requesterName: pending.actor.displayName,
			itemId: pending.link.itemId,
			itemUrl: pending.link.url,
			itemName: metadata.name ?? fallbackItemName(pending.link),
			itemIcon: metadata.icon,
			itemQuality: metadata.quality,
			quantity: pending.quantity,
			characterRealm: pending.characterRealm,
			details: pending.details,
			createdAt: Math.floor(Date.now() / 1000),
		});

		// A follow-up comes back with the message it created, so this both posts
		// the request publicly and tells us the id we need for later edits.
		const message = await createFollowupMessage(env, interactionToken, buildCraftMessage(request));
		if (!message) {
			// Nothing was ever visible, so leave nothing behind.
			await deleteCraftRequest(env.DB, requestId);
			await editOriginalInteractionResponse(
				env,
				interactionToken,
				ephemeralBody('Could not post your crafting request to the channel. Check the bot can post there, then try again.'),
			);
			return;
		}

		await setCraftMessageId(env.DB, requestId, message.id);
		await editOriginalInteractionResponse(env, interactionToken, ephemeralBody('Your crafting request is posted. 🔨'));
	} catch (error) {
		console.error(`Could not create craft request ${requestId}`, error);
		await editOriginalInteractionResponse(
			env,
			interactionToken,
			ephemeralBody('Something went wrong creating that crafting request. Please try again.'),
		).catch(() => undefined);
	}
}

type CraftOutcome = ClaimOutcome | ReleaseOutcome | CompleteOutcome | CraftCancelOutcome;

/**
 * Button presses. Every branch either rewrites the public message in place
 * (`UPDATE_MESSAGE`) or answers privately with why nothing changed — and in the
 * second case still refreshes the message in the background, because a rejection
 * usually means what the clicker was looking at was out of date.
 */
export async function handleCraftComponent(
	interaction: APIMessageComponentInteraction,
	env: Bindings,
	ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
	const action = parseCraftComponentId(interaction.data.custom_id);
	if (!action) return ephemeral('That button is no longer supported.');

	const access = await requireCraftChannel(interaction, env.DB);
	if (!access.allowed) return access.response;

	const actor = getActor(interaction);
	if (!actor) return ephemeral('Could not identify you — try again.');

	const nowSeconds = Math.floor(Date.now() / 1000);

	switch (action.kind) {
		case 'claim': {
			if (!canClaim(actor, access.crafterRoleId)) {
				return ephemeral(`Only members with the <@&${access.crafterRoleId}> role can claim crafting requests here.`);
			}
			const result = await claimCraftRequest(env.DB, action.requestId, actor, nowSeconds);
			return respond(result, claimMessage(result.outcome), interaction, env, ctx);
		}
		case 'release': {
			const result = await releaseCraftRequest(env.DB, action.requestId, actor.id);
			return respond(result, releaseMessage(result.outcome), interaction, env, ctx);
		}
		case 'complete': {
			const result = await completeCraftRequest(env.DB, action.requestId, actor.id, nowSeconds);
			// The DM is queued only for the transition itself; a second click reads
			// back ALREADY_COMPLETED and queues nothing.
			if (result.outcome === 'COMPLETED' && result.request) {
				ctx.waitUntil(notifyRequesterOfCompletion(env, result.request, nowSeconds));
			}
			return respond(result, completeMessage(result.outcome), interaction, env, ctx);
		}
		case 'cancel': {
			const result = await cancelCraftRequest(env.DB, action.requestId, actor);
			return respond(result, cancelMessage(result.outcome), interaction, env, ctx);
		}
	}
}

/**
 * `null` from a `*Message` helper means the action succeeded, so the shared
 * message is rewritten from committed state.
 */
function respond(
	result: CraftMutationResult<CraftOutcome>,
	error: string | null,
	interaction: APIMessageComponentInteraction,
	env: Bindings,
	ctx: ExecutionContext,
): APIInteractionResponse {
	if (!result.request) {
		return ephemeral('That crafting request is no longer tracked — it may have been cleaned up. Start a new one with `/craft`.');
	}
	if (error === null) {
		return { type: InteractionResponseType.UpdateMessage, data: buildCraftMessage(result.request) };
	}
	ctx.waitUntil(refreshCraftMessage(env, interaction.token, result.request));
	return ephemeral(error);
}

async function refreshCraftMessage(env: Bindings, interactionToken: string, request: Parameters<typeof buildCraftMessage>[0]) {
	try {
		await editOriginalInteractionResponse(env, interactionToken, buildCraftMessage(request));
	} catch (error) {
		console.error(`Could not refresh message for craft request ${request.id}`, error);
	}
}

function claimMessage(outcome: ClaimOutcome): string | null {
	switch (outcome) {
		case 'CLAIMED':
			return null;
		case 'ALREADY_YOURS':
			return 'You have already claimed this one.';
		case 'TAKEN':
			return 'Someone else claimed this request first.';
		case 'CLOSED':
			return 'This request is closed, so it cannot be claimed.';
		case 'NOT_FOUND':
			return 'That crafting request no longer exists.';
	}
}

function releaseMessage(outcome: ReleaseOutcome): string | null {
	switch (outcome) {
		case 'RELEASED':
			return null;
		case 'NOT_CRAFTER':
			return 'Only the crafter who claimed this request can release it.';
		case 'NOT_CLAIMED':
			return 'Nobody has claimed this request, so there is nothing to release.';
		case 'CLOSED':
			return 'This request is already closed.';
		case 'NOT_FOUND':
			return 'That crafting request no longer exists.';
	}
}

function completeMessage(outcome: CompleteOutcome): string | null {
	switch (outcome) {
		case 'COMPLETED':
			return null;
		case 'NOT_CRAFTER':
			return 'Only the crafter who claimed this request can mark it complete.';
		case 'NOT_CLAIMED':
			return 'Claim this request first, then mark it complete once the item is made.';
		case 'ALREADY_COMPLETED':
			return 'This request is already marked complete — the requester has been told.';
		case 'CLOSED':
			return 'This request is closed.';
		case 'NOT_FOUND':
			return 'That crafting request no longer exists.';
	}
}

function cancelMessage(outcome: CraftCancelOutcome): string | null {
	switch (outcome) {
		case 'CANCELLED':
			return null;
		case 'FORBIDDEN':
			return 'Only the requester (or a server moderator) can cancel this request.';
		case 'ALREADY_CLOSED':
			return 'This request is already closed.';
		case 'NOT_FOUND':
			return 'That crafting request no longer exists.';
	}
}
