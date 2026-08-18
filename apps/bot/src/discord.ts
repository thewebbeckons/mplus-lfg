import type { APIMessage } from 'discord-api-types/v10';
import { DISCORD_API_BASE } from './constants';
import type { Bindings } from './env';

/**
 * Thin REST client for the few calls that happen *outside* the interaction
 * response: capturing the message id after a run is posted, and refreshing
 * messages from the cron sweep.
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
