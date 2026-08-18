import { type APIInteractionResponse, type APIMessageComponentInteraction, InteractionResponseType } from 'discord-api-types/v10';
import { ROLE_META } from '../constants';
import { parseComponentId } from '../customId';
import { type CancelOutcome, type JoinOutcome, type LeaveOutcome, type MutationResult, cancelGroup, joinGroup, leaveGroup } from '../db';
import { editOriginalInteractionResponse } from '../discord';
import { buildGroupMessage } from '../embeds';
import type { Bindings } from '../env';
import { ephemeral, getActor } from '../interactions';
import type { GroupState, Role } from '../types';

/**
 * Button presses. Every branch either updates the run message in place
 * (`UPDATE_MESSAGE`) or answers privately with why nothing changed.
 */

export async function handleComponent(
	interaction: APIMessageComponentInteraction,
	env: Bindings,
	ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
	const action = parseComponentId(interaction.data.custom_id);
	if (!action) return ephemeral('That button is no longer supported.');

	const actor = getActor(interaction);
	if (!actor) return ephemeral('Could not identify you — try again.');

	const nowSeconds = Math.floor(Date.now() / 1000);

	switch (action.kind) {
		case 'join': {
			const result = await joinGroup(env.DB, action.groupId, actor, action.role, nowSeconds);
			return respond(result, joinMessage(result.outcome, action.role), interaction, env, ctx);
		}
		case 'leave': {
			const result = await leaveGroup(env.DB, action.groupId, actor.id);
			return respond(result, leaveMessage(result.outcome), interaction, env, ctx);
		}
		case 'cancel': {
			const result = await cancelGroup(env.DB, action.groupId, actor);
			return respond(result, cancelMessage(result.outcome), interaction, env, ctx);
		}
	}
}

/**
 * `null` from a `*Message` helper means the action succeeded, so the shared
 * message is rewritten. Otherwise the actor gets a private explanation — and we
 * still refresh the shared message in the background, because a rejection
 * usually means what they were looking at was out of date.
 */
function respond(
	result: MutationResult<JoinOutcome | LeaveOutcome | CancelOutcome>,
	error: string | null,
	interaction: APIMessageComponentInteraction,
	env: Bindings,
	ctx: ExecutionContext,
): APIInteractionResponse {
	if (!result.state) {
		return ephemeral('That run is no longer tracked — it may have been cleaned up. Start a new one with `/lfg`.');
	}
	if (error === null) {
		return { type: InteractionResponseType.UpdateMessage, data: buildGroupMessage(result.state) };
	}
	ctx.waitUntil(refreshMessage(env, interaction.token, result.state));
	return ephemeral(error);
}

async function refreshMessage(env: Bindings, interactionToken: string, state: GroupState): Promise<void> {
	try {
		await editOriginalInteractionResponse(env, interactionToken, buildGroupMessage(state));
	} catch (error) {
		console.error(`Could not refresh message for group ${state.group.id}`, error);
	}
}

function joinMessage(outcome: JoinOutcome, role: Role): string | null {
	switch (outcome) {
		case 'JOINED':
		case 'SWITCHED':
			return null;
		case 'ALREADY_IN_ROLE':
			return `You are already signed up as ${ROLE_META[role].label}.`;
		case 'ROLE_FULL':
			return `The ${ROLE_META[role].label} slots are already taken — someone beat you to it.`;
		case 'CLOSED':
			return 'This run is no longer accepting sign-ups.';
		case 'NOT_FOUND':
			return 'That run no longer exists.';
	}
}

function leaveMessage(outcome: LeaveOutcome): string | null {
	switch (outcome) {
		case 'LEFT':
			return null;
		case 'NOT_SIGNED_UP':
			return 'You were not signed up for this run.';
		case 'CLOSED':
			return 'This run is closed, so the roster is locked.';
		case 'NOT_FOUND':
			return 'That run no longer exists.';
	}
}

function cancelMessage(outcome: CancelOutcome): string | null {
	switch (outcome) {
		case 'CANCELLED':
			return null;
		case 'FORBIDDEN':
			return 'Only the run leader (or a server moderator) can cancel this run. Use **Leave** to drop your own spot.';
		case 'ALREADY_CLOSED':
			return 'This run is already closed.';
		case 'NOT_FOUND':
			return 'That run no longer exists.';
	}
}
