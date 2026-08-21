import { type APIInteraction, type APIInteractionResponse, InteractionResponseType, InteractionType } from 'discord-api-types/v10';
import {
	EXPIRY_GRACE_SECONDS,
	EXPIRY_SWEEP_LIMIT,
	MAX_GROUP_AGE_SECONDS,
	PURGE_AFTER_SECONDS,
	PURGE_SWEEP_LIMIT,
} from './constants';
import { expireStaleGroups, purgeGroupsPastRetention } from './db';
import { editChannelMessage } from './discord';
import { buildGroupMessage } from './embeds';
import type { Bindings } from './env';
import { handleCommand } from './handlers/command';
import { handleComponent } from './handlers/component';
import { handleModalSubmit } from './handlers/modal';
import { ephemeral } from './interactions';
import { verifyDiscordRequest } from './verify';

/**
 * Serverless Mythic+ LFG bot.
 *
 * `fetch`     — Discord HTTP interactions (no gateway, no persistent connection).
 * `scheduled` — cron maintenance: expires stale runs, then deletes old ones.
 */

async function route(interaction: APIInteraction, env: Bindings, ctx: ExecutionContext): Promise<APIInteractionResponse> {
	switch (interaction.type) {
		case InteractionType.Ping:
			return { type: InteractionResponseType.Pong };
		case InteractionType.ApplicationCommand:
			return handleCommand(interaction, env);
		case InteractionType.ModalSubmit:
			return handleModalSubmit(interaction, env, ctx);
		case InteractionType.MessageComponent:
			return handleComponent(interaction, env, ctx);
		default:
			return ephemeral('This bot does not handle that interaction type.');
	}
}

async function handleInteractions(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
	const { valid, body } = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
	// Discord requires a 401 here; it sends a deliberately bad signature when
	// validating the interactions endpoint URL and refuses to save it otherwise.
	if (!valid) return new Response('Bad request signature', { status: 401 });

	let interaction: APIInteraction;
	try {
		interaction = JSON.parse(body) as APIInteraction;
	} catch {
		return new Response('Malformed payload', { status: 400 });
	}

	try {
		return Response.json(await route(interaction, env, ctx));
	} catch (error) {
		// Never surface a 5xx to Discord: it shows the user "the application did
		// not respond" with no explanation. Log it and reply privately instead.
		console.error('Interaction handler threw', error);
		return Response.json(ephemeral('Something went wrong handling that. Please try again.'));
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/interactions')) {
			return handleInteractions(request, env, ctx);
		}
		if (request.method === 'GET' && url.pathname === '/health') {
			return new Response('ok');
		}
		return new Response('Not found', { status: 404 });
	},

	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(runMaintenance(env));
	},
} satisfies ExportedHandler<Bindings>;

/**
 * Expiry runs before the purge, so a run is never deleted before its message
 * has been closed out. The two windows are far enough apart that this is a
 * formality — a run is expired half an hour after it starts and deleted a day
 * later — but the order makes the dependency explicit.
 */
async function runMaintenance(env: Bindings): Promise<void> {
	await sweepExpiredGroups(env);
	await purgeOldRuns(env);
}

/**
 * Marks runs whose start time has passed (or which we could never date and are
 * now old) as EXPIRED, then rewrites their messages so the buttons go dead
 * instead of erroring when someone clicks them days later.
 */
export async function sweepExpiredGroups(env: Bindings): Promise<number> {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const expired = await expireStaleGroups(env.DB, nowSeconds, EXPIRY_GRACE_SECONDS, MAX_GROUP_AGE_SECONDS, EXPIRY_SWEEP_LIMIT);
	if (expired.length === 0) return 0;

	// Groups created before the message id was captured simply skip the edit.
	const edits = expired
		.filter((state) => state.group.message_id !== null)
		.map((state) => editChannelMessage(env, state.group.channel_id, state.group.message_id as string, buildGroupMessage(state)));

	// `allSettled`: one deleted channel must not abort the rest of the sweep.
	await Promise.allSettled(edits);
	console.log(`Expired ${expired.length} Mythic+ run(s), refreshed ${edits.length} message(s)`);
	return expired.length;
}

/**
 * Deletes runs past their retention window along with their rosters. The
 * Discord messages are left alone: the sweep above already rewrote them into a
 * closed state with dead buttons, and anyone who does click one on an unedited
 * post gets a plain "that run no longer exists" reply.
 */
export async function purgeOldRuns(env: Bindings): Promise<number> {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const purged = await purgeGroupsPastRetention(env.DB, nowSeconds, PURGE_AFTER_SECONDS, PURGE_SWEEP_LIMIT);
	if (purged > 0) console.log(`Purged ${purged} Mythic+ run(s) past the retention window`);
	return purged;
}
