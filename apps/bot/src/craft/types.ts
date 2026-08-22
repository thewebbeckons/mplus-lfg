export type CraftStatus = 'OPEN' | 'CLAIMED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

/**
 * Outcome of the completion DM.
 *
 * Recorded so a second "Mark complete" click — or a retry after a partial
 * failure — can tell "already told them" from "never told them" and refuse to
 * send a duplicate.
 */
export type NotifyStatus = 'PENDING' | 'DM_SENT' | 'DM_FAILED' | 'FALLBACK_POSTED';

/** Row shape of `craft_requests`. */
export interface CraftRequestRow {
	id: string;
	guild_id: string;
	channel_id: string;
	/** Captured after the public post is created; null if that post failed. */
	message_id: string | null;
	requester_id: string;
	requester_name: string;
	item_id: number;
	/** Exactly what was submitted, bonus/modifier parameters and all. */
	item_url: string;
	/** Resolved through the Blizzard API, or a fallback derived from the URL. */
	item_name: string | null;
	item_icon: string | null;
	item_quality: string | null;
	quantity: number;
	character_realm: string | null;
	details: string | null;
	status: CraftStatus;
	crafter_id: string | null;
	crafter_name: string | null;
	created_at: number;
	claimed_at: number | null;
	completed_at: number | null;
	notified_at: number | null;
	notify_status: NotifyStatus | null;
}
