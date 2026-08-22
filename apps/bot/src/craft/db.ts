import { placeholders, rowsOf } from '../sql';
import type { CraftRequestRow, CraftStatus, NotifyStatus } from './types';

/**
 * D1 access layer for crafting requests.
 *
 * Same discipline as the LFG layer: every mutation is a single `batch()` — one
 * implicit transaction — and every permission and state check lives *inside*
 * the `WHERE` clause rather than in a read-then-write. Two crafters clicking
 * "I'll craft it" at the same instant therefore cannot both win: the loser's
 * guarded UPDATE affects zero rows and reads back the winner's committed state.
 *
 * Each mutation ends by re-reading the row in the same transaction, so callers
 * always render from committed state rather than from what they hoped happened.
 */

const SELECT_SQL = 'SELECT * FROM craft_requests WHERE id = ?1';

export async function loadCraftRequest(db: D1Database, requestId: string): Promise<CraftRequestRow | null> {
	return db.prepare(SELECT_SQL).bind(requestId).first<CraftRequestRow>();
}

export interface NewCraftRequest {
	id: string;
	guildId: string;
	channelId: string;
	requesterId: string;
	requesterName: string;
	itemId: number;
	itemUrl: string;
	itemName: string | null;
	itemIcon: string | null;
	itemQuality: string | null;
	quantity: number;
	characterRealm: string | null;
	details: string | null;
	createdAt: number;
}

export async function createCraftRequest(db: D1Database, input: NewCraftRequest): Promise<CraftRequestRow> {
	const results = await db.batch([
		db
			.prepare(
				`INSERT INTO craft_requests
					(id, guild_id, channel_id, requester_id, requester_name, item_id, item_url,
					 item_name, item_icon, item_quality, quantity, character_realm, details, status, created_at)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'OPEN', ?14)`,
			)
			.bind(
				input.id,
				input.guildId,
				input.channelId,
				input.requesterId,
				input.requesterName,
				input.itemId,
				input.itemUrl,
				input.itemName,
				input.itemIcon,
				input.itemQuality,
				input.quantity,
				input.characterRealm,
				input.details,
				input.createdAt,
			),
		db.prepare(SELECT_SQL).bind(input.id),
	]);

	const row = rowsOf<CraftRequestRow>(results[1])[0];
	if (!row) throw new Error(`Craft request ${input.id} vanished immediately after insert`);
	return row;
}

/** Records the message id once Discord tells us what it created. */
export async function setCraftMessageId(db: D1Database, requestId: string, messageId: string): Promise<void> {
	await db.prepare('UPDATE craft_requests SET message_id = ?2 WHERE id = ?1').bind(requestId, messageId).run();
}

/** Removes a request whose public post never made it, so nothing invisible lingers. */
export async function deleteCraftRequest(db: D1Database, requestId: string): Promise<void> {
	await db.prepare('DELETE FROM craft_requests WHERE id = ?1').bind(requestId).run();
}

export type ClaimOutcome = 'CLAIMED' | 'ALREADY_YOURS' | 'TAKEN' | 'CLOSED' | 'NOT_FOUND';
export type ReleaseOutcome = 'RELEASED' | 'NOT_CRAFTER' | 'NOT_CLAIMED' | 'CLOSED' | 'NOT_FOUND';
export type CompleteOutcome = 'COMPLETED' | 'NOT_CRAFTER' | 'NOT_CLAIMED' | 'ALREADY_COMPLETED' | 'CLOSED' | 'NOT_FOUND';
export type CraftCancelOutcome = 'CANCELLED' | 'FORBIDDEN' | 'ALREADY_CLOSED' | 'NOT_FOUND';

export interface CraftMutationResult<TOutcome> {
	outcome: TOutcome;
	/** Committed state after the attempt; null only when the request no longer exists. */
	request: CraftRequestRow | null;
}

interface PriorState {
	status: CraftStatus;
	crafter_id: string | null;
}

const SELECT_PRIOR_SQL = 'SELECT status, crafter_id FROM craft_requests WHERE id = ?1';

function isLive(status: CraftStatus): boolean {
	return status === 'OPEN' || status === 'CLAIMED';
}

/**
 * `OPEN → CLAIMED`. The `status = 'OPEN'` guard is the whole race protection:
 * whichever transaction commits second sees CLAIMED and updates nothing.
 */
export async function claimCraftRequest(
	db: D1Database,
	requestId: string,
	crafter: { id: string; displayName: string },
	nowSeconds: number,
): Promise<CraftMutationResult<ClaimOutcome>> {
	const results = await db.batch([
		db.prepare(SELECT_PRIOR_SQL).bind(requestId),
		db
			.prepare(
				`UPDATE craft_requests SET status = 'CLAIMED', crafter_id = ?2, crafter_name = ?3, claimed_at = ?4
				 WHERE id = ?1 AND status = 'OPEN'`,
			)
			.bind(requestId, crafter.id, crafter.displayName, nowSeconds),
		db.prepare(SELECT_SQL).bind(requestId),
	]);

	const prior = rowsOf<PriorState>(results[0])[0] ?? null;
	const request = rowsOf<CraftRequestRow>(results[2])[0] ?? null;
	if (!request || !prior) return { outcome: 'NOT_FOUND', request };

	if (prior.status === 'OPEN') return { outcome: 'CLAIMED', request };
	if (prior.status === 'CLAIMED') {
		return { outcome: prior.crafter_id === crafter.id ? 'ALREADY_YOURS' : 'TAKEN', request };
	}
	return { outcome: 'CLOSED', request };
}

/**
 * `CLAIMED → OPEN`. `crafter_id = ?2` in the guard is the authorisation: only
 * the person currently holding it can hand it back.
 */
export async function releaseCraftRequest(
	db: D1Database,
	requestId: string,
	crafterId: string,
): Promise<CraftMutationResult<ReleaseOutcome>> {
	const results = await db.batch([
		db.prepare(SELECT_PRIOR_SQL).bind(requestId),
		db
			.prepare(
				`UPDATE craft_requests SET status = 'OPEN', crafter_id = NULL, crafter_name = NULL, claimed_at = NULL
				 WHERE id = ?1 AND status = 'CLAIMED' AND crafter_id = ?2`,
			)
			.bind(requestId, crafterId),
		db.prepare(SELECT_SQL).bind(requestId),
	]);

	const prior = rowsOf<PriorState>(results[0])[0] ?? null;
	const request = rowsOf<CraftRequestRow>(results[2])[0] ?? null;
	if (!request || !prior) return { outcome: 'NOT_FOUND', request };

	if (prior.status === 'OPEN') return { outcome: 'NOT_CLAIMED', request };
	if (!isLive(prior.status)) return { outcome: 'CLOSED', request };
	return { outcome: prior.crafter_id === crafterId ? 'RELEASED' : 'NOT_CRAFTER', request };
}

/**
 * `CLAIMED → COMPLETED`, guarded on the actor still being the crafter.
 *
 * `COMPLETED` is returned only by the transaction that actually performed the
 * transition. A second click reads back `ALREADY_COMPLETED`, which is what stops
 * the completion DM being sent twice.
 */
export async function completeCraftRequest(
	db: D1Database,
	requestId: string,
	crafterId: string,
	nowSeconds: number,
): Promise<CraftMutationResult<CompleteOutcome>> {
	const results = await db.batch([
		db.prepare(SELECT_PRIOR_SQL).bind(requestId),
		db
			.prepare(
				`UPDATE craft_requests SET status = 'COMPLETED', completed_at = ?3
				 WHERE id = ?1 AND status = 'CLAIMED' AND crafter_id = ?2`,
			)
			.bind(requestId, crafterId, nowSeconds),
		db.prepare(SELECT_SQL).bind(requestId),
	]);

	const prior = rowsOf<PriorState>(results[0])[0] ?? null;
	const request = rowsOf<CraftRequestRow>(results[2])[0] ?? null;
	if (!request || !prior) return { outcome: 'NOT_FOUND', request };

	if (prior.status === 'COMPLETED') return { outcome: 'ALREADY_COMPLETED', request };
	if (prior.status === 'OPEN') return { outcome: 'NOT_CLAIMED', request };
	if (!isLive(prior.status)) return { outcome: 'CLOSED', request };
	return { outcome: prior.crafter_id === crafterId ? 'COMPLETED' : 'NOT_CRAFTER', request };
}

/** `OPEN`/`CLAIMED → CANCELLED`, for the requester or a server moderator. */
export async function cancelCraftRequest(
	db: D1Database,
	requestId: string,
	actor: { id: string; isAdmin: boolean },
): Promise<CraftMutationResult<CraftCancelOutcome>> {
	const results = await db.batch([
		db.prepare(SELECT_PRIOR_SQL).bind(requestId),
		// Authorisation lives in the WHERE clause, so it is applied atomically
		// against the same snapshot the update sees.
		db
			.prepare(
				`UPDATE craft_requests SET status = 'CANCELLED'
				 WHERE id = ?1 AND status IN ('OPEN', 'CLAIMED') AND (requester_id = ?2 OR ?3 = 1)`,
			)
			.bind(requestId, actor.id, actor.isAdmin ? 1 : 0),
		db.prepare(SELECT_SQL).bind(requestId),
	]);

	const prior = rowsOf<PriorState>(results[0])[0] ?? null;
	const request = rowsOf<CraftRequestRow>(results[2])[0] ?? null;
	if (!request || !prior) return { outcome: 'NOT_FOUND', request };

	if (!isLive(prior.status)) return { outcome: 'ALREADY_CLOSED', request };
	return { outcome: request.status === 'CANCELLED' ? 'CANCELLED' : 'FORBIDDEN', request };
}

/**
 * Reserves the right to send the completion DM.
 *
 * Separate from the completion transition on purpose. The transition already
 * happens once, but a retry, a duplicate delivery of the same interaction, or a
 * later repair job could all try to notify again; this claim succeeds exactly
 * once per request, and only the caller that wins it sends anything.
 *
 * @returns true when this caller now owns sending the notification.
 */
export async function claimCompletionNotice(db: D1Database, requestId: string, nowSeconds: number): Promise<boolean> {
	const result = await db
		.prepare(
			`UPDATE craft_requests SET notify_status = 'PENDING', notified_at = ?2
			 WHERE id = ?1 AND status = 'COMPLETED' AND notify_status IS NULL`,
		)
		.bind(requestId, nowSeconds)
		.run();
	return (result.meta.changes ?? 0) === 1;
}

/** Records how the completion notice actually went, once it has been attempted. */
export async function recordCompletionNotice(db: D1Database, requestId: string, status: NotifyStatus): Promise<void> {
	await db.prepare('UPDATE craft_requests SET notify_status = ?2 WHERE id = ?1').bind(requestId, status).run();
}

/**
 * Marks unfinished requests EXPIRED and returns them so the caller can refresh
 * the Discord messages.
 *
 * Age based rather than deadline based: a crafting request has no start time, it
 * just stops being realistic to fulfil after a while.
 */
export async function expireStaleCraftRequests(
	db: D1Database,
	nowSeconds: number,
	maxAgeSeconds: number,
	limit: number,
): Promise<CraftRequestRow[]> {
	const stale = await db
		.prepare(
			`SELECT id FROM craft_requests
			 WHERE status IN ('OPEN', 'CLAIMED') AND created_at < ?1
			 ORDER BY created_at ASC
			 LIMIT ?2`,
		)
		.bind(nowSeconds - maxAgeSeconds, limit)
		.all();

	const ids = rowsOf<{ id: string }>(stale).map((row) => row.id);
	if (ids.length === 0) return [];

	// RETURNING yields only the rows this sweep actually expired, so a request
	// completed between the scan and the update is never overwritten.
	const result = await db
		.prepare(
			`UPDATE craft_requests SET status = 'EXPIRED'
			 WHERE id IN (${placeholders(ids.length)}) AND status IN ('OPEN', 'CLAIMED')
			 RETURNING *`,
		)
		.bind(...ids)
		.all();

	return rowsOf<CraftRequestRow>(result);
}

/**
 * Deletes requests past their retention window.
 *
 * Keyed to `created_at` and not to status: age alone is self-healing, so a
 * request the expiry sweep somehow missed is still cleaned up rather than
 * keeping its user ids, character name, and notes indefinitely.
 */
export async function purgeCraftRequestsPastRetention(
	db: D1Database,
	nowSeconds: number,
	retentionSeconds: number,
	limit: number,
): Promise<number> {
	const result = await db
		.prepare(
			`DELETE FROM craft_requests WHERE id IN (
				SELECT id FROM craft_requests WHERE created_at < ?1 ORDER BY created_at ASC, id ASC LIMIT ?2
			 )`,
		)
		.bind(nowSeconds - retentionSeconds, limit)
		.run();

	return result.meta.changes ?? 0;
}
