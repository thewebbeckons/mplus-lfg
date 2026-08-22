import type { APIMessage } from 'discord-api-types/v10';
import { DISCORD_API_BASE } from './constants';
import type { Bindings } from './env';

/**
 * Thin REST client for the calls that happen *outside* the interaction
 * response: capturing message ids, posting follow-ups, refreshing messages from
 * the cron sweep, and opening a DM to tell a requester their order is ready.
 */

interface RequestOptions {
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	path: string;
	body?: unknown;
	/** Interaction webhook routes are authenticated by the token in the URL. */
	auth?: 'bot' | 'none';
}

async function discordRequest(env: Bindings, options: RequestOptions): Promise<Response> {
	const headers: Record<string, string> = { 'User-Agent': 'mplus-lfg (Cloudflare Workers)' };
	if (options.auth !== 'none') headers.Authorization = `Bot ${env.DISCORD_TOKEN}`;
	if (options.body !== undefined) headers['Content-Type'] = 'application/json';

	return fetch(`${DISCORD_API_BASE}${options.path}`, {
		method: options.method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
}

async function logFailure(context: string, response: Response): Promise<void> {
	const detail = await response.text().catch(() => '<unreadable>');
	console.error(`${context} failed: ${response.status} ${response.statusText} ${detail}`);
}

/**
 * Fetches the message Discord created from our interaction response. Discord
 * does not include it in the interaction payload, so this is the only way to
 * learn the message id we need for later edits.
 */
export async function fetchOriginalInteractionResponse(env: Bindings, interactionToken: string): Promise<APIMessage | null> {
	const response = await discordRequest(env, {
		method: 'GET',
		path: `/webhooks/${env.DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
		auth: 'none',
	});
	if (!response.ok) {
		await logFailure('Fetching original interaction response', response);
		return null;
	}
	return (await response.json()) as APIMessage;
}

/** Edits the message backing an interaction; valid for 15 minutes after the interaction. */
export async function editOriginalInteractionResponse(env: Bindings, interactionToken: string, payload: unknown): Promise<boolean> {
	const response = await discordRequest(env, {
		method: 'PATCH',
		path: `/webhooks/${env.DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
		body: payload,
		auth: 'none',
	});
	if (!response.ok) await logFailure('Editing original interaction response', response);
	return response.ok;
}

/**
 * Posts a follow-up to an interaction, in the channel it came from.
 *
 * Unlike the initial response, this one comes back with the created message, so
 * it is also how a public post gets its message id without a second round trip.
 */
export async function createFollowupMessage(env: Bindings, interactionToken: string, payload: unknown): Promise<APIMessage | null> {
	const response = await discordRequest(env, {
		method: 'POST',
		path: `/webhooks/${env.DISCORD_APPLICATION_ID}/${interactionToken}`,
		body: payload,
		auth: 'none',
	});
	if (!response.ok) {
		await logFailure('Posting interaction follow-up', response);
		return null;
	}
	return (await response.json()) as APIMessage;
}

/**
 * Edits a message by id using the bot token. Used by the cron sweep, which runs
 * long after any interaction token has expired.
 */
export async function editChannelMessage(env: Bindings, channelId: string, messageId: string, payload: unknown): Promise<boolean> {
	const response = await discordRequest(env, {
		method: 'PATCH',
		path: `/channels/${channelId}/messages/${messageId}`,
		body: payload,
	});
	if (!response.ok) await logFailure(`Editing message ${messageId}`, response);
	return response.ok;
}

/** Posts a new message to a channel with the bot token. */
export async function createChannelMessage(env: Bindings, channelId: string, payload: unknown): Promise<boolean> {
	const response = await discordRequest(env, { method: 'POST', path: `/channels/${channelId}/messages`, body: payload });
	if (!response.ok) await logFailure(`Posting to channel ${channelId}`, response);
	return response.ok;
}

/**
 * Opens (or reuses) the DM channel with a user.
 *
 * Discord refuses this for users who share no server with the bot, and refuses
 * the subsequent send for users who have direct messages turned off, so both
 * steps are treated as "the DM did not happen" rather than as an error.
 */
export async function createDmChannel(env: Bindings, userId: string): Promise<string | null> {
	const response = await discordRequest(env, {
		method: 'POST',
		path: '/users/@me/channels',
		body: { recipient_id: userId },
	});
	if (!response.ok) {
		await logFailure(`Opening a DM with ${userId}`, response);
		return null;
	}
	const channel = (await response.json()) as { id?: string };
	return channel.id ?? null;
}

/** Sends a direct message, reporting failure rather than throwing. */
export async function sendDirectMessage(env: Bindings, userId: string, payload: unknown): Promise<boolean> {
	const channelId = await createDmChannel(env, userId);
	if (!channelId) return false;
	return createChannelMessage(env, channelId, payload);
}
