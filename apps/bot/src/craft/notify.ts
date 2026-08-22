import { createChannelMessage, sendDirectMessage } from '../discord';
import type { Bindings } from '../env';
import { claimCompletionNotice, recordCompletionNotice } from './db';
import { craftJumpLink, itemLabel } from './embeds';
import type { CraftRequestRow, NotifyStatus } from './types';

/**
 * "Your order is ready" — the one message this bot sends outside a channel.
 *
 * Sending it is gated on `claimCompletionNotice`, which succeeds exactly once
 * per request. Every other path into here — a second "Mark complete" click, a
 * duplicated interaction delivery, a retry after a partial failure — loses that
 * claim and sends nothing, so a requester can never be DMed twice about the
 * same craft.
 */

/**
 * Discord refuses a DM when the requester has direct messages from server
 * members turned off, or has blocked the bot. That is a normal, expected
 * outcome rather than an error, so it falls back to a single mention in the
 * crafting channel.
 */
export async function notifyRequesterOfCompletion(env: Bindings, request: CraftRequestRow, nowSeconds: number): Promise<void> {
	const owned = await claimCompletionNotice(env.DB, request.id, nowSeconds);
	if (!owned) return;

	let status: NotifyStatus = 'DM_FAILED';
	try {
		const sent = await sendDirectMessage(env, request.requester_id, {
			content: completionMessage(request),
			// The message quotes a character name and an item name the requester
			// typed; nothing in it is allowed to become a ping.
			allowed_mentions: { parse: [] },
		});

		if (sent) {
			status = 'DM_SENT';
		} else if (await postChannelFallback(env, request)) {
			status = 'FALLBACK_POSTED';
		}
	} catch (error) {
		console.error(`Completion notice for craft request ${request.id} failed`, error);
	}

	await recordCompletionNotice(env.DB, request.id, status);
}

function completionMessage(request: CraftRequestRow): string {
	const jump = craftJumpLink(request);
	const crafter = request.crafter_name ?? 'a guild crafter';

	return [
		`✅ **Your crafting request is done!**`,
		'',
		`**Item** ${itemLabel(request)}`,
		`**Crafted by** ${crafter}`,
		request.character_realm ? `**For** ${request.character_realm}` : null,
		jump ? `\n[Jump to the original request](${jump})` : null,
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

/**
 * Restrained on purpose: one line, one mention, in the channel the request was
 * already public in. The requester is the only id allowed to resolve, so no
 * amount of typed text can turn this into an @everyone.
 */
async function postChannelFallback(env: Bindings, request: CraftRequestRow): Promise<boolean> {
	return createChannelMessage(env, request.channel_id, {
		content: `<@${request.requester_id}> your **${itemLabel(request)}** is ready — I could not DM you, so here it is.`,
		allowed_mentions: { parse: [], users: [request.requester_id] },
		...(request.message_id ? { message_reference: { message_id: request.message_id, fail_if_not_exists: false } } : {}),
	});
}
