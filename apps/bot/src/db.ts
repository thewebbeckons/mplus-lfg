import type { GroupRow, GroupState, GroupStatus, PartyPlan, Role, SignupRow } from './types';

/**
 * D1 access layer.
 *
 * Every mutation runs as a single `batch()` — D1 wraps a batch in one implicit
 * transaction — and every capacity/permission check is expressed *inside* the
 * SQL rather than as a read-then-write in JavaScript. Two players hammering the
 * same Tank button therefore cannot both get the slot: the loser's guarded
 * INSERT simply affects zero rows.
 *
 * Each mutation ends by re-reading the group and its roster in the same
 * transaction, so callers always render from committed state.
 */

const SELECT_GROUP_SQL = 'SELECT * FROM mplus_groups WHERE id = ?1';
const SELECT_SIGNUPS_SQL = 'SELECT * FROM mplus_signups WHERE group_id = ?1 ORDER BY signed_at ASC, id ASC';

/**
 * Re-derive OPEN vs FULL from the roster. Runs after every roster change and is
 * a no-op for groups that are no longer live (cancelled, expired, completed).
 */
const RECOMPUTE_STATUS_SQL = `
	UPDATE mplus_groups SET status = CASE
		WHEN (SELECT COUNT(*) FROM mplus_signups s WHERE s.group_id = mplus_groups.id AND s.role = 'TANK')
			 + mplus_groups.tank_reserved >= mplus_groups.tank_needed
		 AND (SELECT COUNT(*) FROM mplus_signups s WHERE s.group_id = mplus_groups.id AND s.role = 'HEALER')
			 + mplus_groups.healer_reserved >= mplus_groups.healer_needed
		 AND (SELECT COUNT(*) FROM mplus_signups s WHERE s.group_id = mplus_groups.id AND s.role = 'DPS')
			 + mplus_groups.dps_reserved >= mplus_groups.dps_needed
		THEN 'FULL' ELSE 'OPEN' END
	WHERE id = ?1 AND status IN ('OPEN', 'FULL')`;

/**
 * Insert-or-switch, gated on the group being live and the target role having a
 * free slot. `s.user_id <> ?2` excludes the actor's own current signup so that
 * re-clicking your current role, or switching away and back, is never blocked
 * by yourself.
 */
const GUARDED_JOIN_SQL = `
	INSERT INTO mplus_signups (group_id, user_id, username, role, signed_at)
	SELECT ?1, ?2, ?3, ?4, ?5
	WHERE EXISTS (
		SELECT 1 FROM mplus_groups g
		WHERE g.id = ?1
		  AND g.status IN ('OPEN', 'FULL')
		  AND (SELECT COUNT(*) FROM mplus_signups s WHERE s.group_id = ?1 AND s.role = ?4 AND s.user_id <> ?2)
		      + CASE ?4 WHEN 'TANK' THEN g.tank_reserved WHEN 'HEALER' THEN g.healer_reserved ELSE g.dps_reserved END
		      < CASE ?4 WHEN 'TANK' THEN g.tank_needed WHEN 'HEALER' THEN g.healer_needed ELSE g.dps_needed END
	)
	ON CONFLICT (group_id, user_id) DO UPDATE SET
		username = excluded.username,
		role = excluded.role`;

function rowsOf<T>(result: D1Result | undefined): T[] {
	return (result?.results ?? []) as unknown as T[];
}

function stateOf(groupResult: D1Result | undefined, signupResult: D1Result | undefined): GroupState | null {
	const group = rowsOf<GroupRow>(groupResult)[0];
	return group ? { group, signups: rowsOf<SignupRow>(signupResult) } : null;
}

export async function loadState(db: D1Database, groupId: string): Promise<GroupState | null> {
	const results = await db.batch([
		db.prepare(SELECT_GROUP_SQL).bind(groupId),
		db.prepare(SELECT_SIGNUPS_SQL).bind(groupId),
	]);
	return stateOf(results[0], results[1]);
}

export interface NewGroup {
	id: string;
	guildId: string;
	channelId: string;
	creatorId: string;
	creatorName: string;
	creatorRole: Role;
	activity: string;
	startTime: string;
	startTs: number | null;
	notes: string | null;
	/** Total slots per role, and the ones already covered by a premade. */
	plan: PartyPlan;
	createdAt: number;
}

export async function createGroup(db: D1Database, input: NewGroup): Promise<GroupState> {
	const results = await db.batch([
		db
			.prepare(
				`INSERT INTO mplus_groups
					(id, guild_id, channel_id, creator_id, activity, start_time, start_ts, notes,
					 tank_needed, healer_needed, dps_needed, tank_reserved, healer_reserved, dps_reserved, status, created_at)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'OPEN', ?15)`,
			)
			.bind(
				input.id,
				input.guildId,
				input.channelId,
				input.creatorId,
				input.activity,
				input.startTime,
				input.startTs,
				input.notes,
				input.plan.total.TANK,
				input.plan.total.HEALER,
				input.plan.total.DPS,
				input.plan.reserved.TANK,
				input.plan.reserved.HEALER,
				input.plan.reserved.DPS,
				input.createdAt,
			),
		db
			.prepare('INSERT INTO mplus_signups (group_id, user_id, username, role, signed_at) VALUES (?1, ?2, ?3, ?4, ?5)')
			.bind(input.id, input.creatorId, input.creatorName, input.creatorRole, input.createdAt),
		// A solo composition, or one where the premade fills every remaining slot,
		// is already full the moment it is created.
		db.prepare(RECOMPUTE_STATUS_SQL).bind(input.id),
		db.prepare(SELECT_GROUP_SQL).bind(input.id),
		db.prepare(SELECT_SIGNUPS_SQL).bind(input.id),
	]);

	const state = stateOf(results[3], results[4]);
	if (!state) throw new Error(`Group ${input.id} vanished immediately after insert`);
	return state;
}

/** Records the message id once Discord tells us what it created. */
export async function setMessageId(db: D1Database, groupId: string, messageId: string): Promise<void> {
	await db.prepare('UPDATE mplus_groups SET message_id = ?2 WHERE id = ?1').bind(groupId, messageId).run();
}

export type JoinOutcome = 'JOINED' | 'SWITCHED' | 'ALREADY_IN_ROLE' | 'ROLE_FULL' | 'CLOSED' | 'NOT_FOUND';
export type LeaveOutcome = 'LEFT' | 'NOT_SIGNED_UP' | 'CLOSED' | 'NOT_FOUND';
export type CancelOutcome = 'CANCELLED' | 'FORBIDDEN' | 'ALREADY_CLOSED' | 'NOT_FOUND';

export interface MutationResult<TOutcome> {
	outcome: TOutcome;
	/** Committed state after the attempt; null only when the group no longer exists. */
	state: GroupState | null;
}

function isLive(group: GroupRow): boolean {
	return group.status === 'OPEN' || group.status === 'FULL';
}

export async function joinGroup(
	db: D1Database,
	groupId: string,
	user: { id: string; displayName: string },
	role: Role,
	nowSeconds: number,
): Promise<MutationResult<JoinOutcome>> {
	const results = await db.batch([
		db.prepare('SELECT role FROM mplus_signups WHERE group_id = ?1 AND user_id = ?2').bind(groupId, user.id),
		db.prepare(GUARDED_JOIN_SQL).bind(groupId, user.id, user.displayName, role, nowSeconds),
		db.prepare(RECOMPUTE_STATUS_SQL).bind(groupId),
		db.prepare(SELECT_GROUP_SQL).bind(groupId),
		db.prepare(SELECT_SIGNUPS_SQL).bind(groupId),
	]);

	const previousRole = rowsOf<{ role: Role }>(results[0])[0]?.role ?? null;
	const state = stateOf(results[3], results[4]);
	if (!state) return { outcome: 'NOT_FOUND', state: null };
	if (!isLive(state.group)) return { outcome: 'CLOSED', state };

	// Derive the outcome from committed state rather than from `meta.changes`:
	// the guarded INSERT is silently a no-op when it is rejected.
	const current = state.signups.find((signup) => signup.user_id === user.id);
	if (current?.role !== role) return { outcome: 'ROLE_FULL', state };
	if (previousRole === role) return { outcome: 'ALREADY_IN_ROLE', state };
	return { outcome: previousRole ? 'SWITCHED' : 'JOINED', state };
}

export async function leaveGroup(db: D1Database, groupId: string, userId: string): Promise<MutationResult<LeaveOutcome>> {
	const results = await db.batch([
		db.prepare('SELECT role FROM mplus_signups WHERE group_id = ?1 AND user_id = ?2').bind(groupId, userId),
		// Guarded on liveness so nobody can quietly drop out of a completed run.
		db
			.prepare(
				`DELETE FROM mplus_signups
				 WHERE group_id = ?1 AND user_id = ?2
				   AND EXISTS (SELECT 1 FROM mplus_groups g WHERE g.id = ?1 AND g.status IN ('OPEN', 'FULL'))`,
			)
			.bind(groupId, userId),
		db.prepare(RECOMPUTE_STATUS_SQL).bind(groupId),
		db.prepare(SELECT_GROUP_SQL).bind(groupId),
		db.prepare(SELECT_SIGNUPS_SQL).bind(groupId),
	]);

	const wasSignedUp = rowsOf<{ role: Role }>(results[0]).length > 0;
	const state = stateOf(results[3], results[4]);
	if (!state) return { outcome: 'NOT_FOUND', state: null };
	if (!isLive(state.group)) return { outcome: 'CLOSED', state };
	return { outcome: wasSignedUp ? 'LEFT' : 'NOT_SIGNED_UP', state };
}

export async function cancelGroup(
	db: D1Database,
	groupId: string,
	actor: { id: string; isAdmin: boolean },
): Promise<MutationResult<CancelOutcome>> {
	const results = await db.batch([
		// Read the prior status so a run that was *already* cancelled is not
		// reported back as a successful cancel.
		db.prepare('SELECT status FROM mplus_groups WHERE id = ?1').bind(groupId),
		// Authorisation lives in the WHERE clause, so it is applied atomically
		// against the same snapshot the update sees.
		db
			.prepare(
				`UPDATE mplus_groups SET status = 'CANCELLED'
				 WHERE id = ?1 AND status IN ('OPEN', 'FULL') AND (creator_id = ?2 OR ?3 = 1)`,
			)
			.bind(groupId, actor.id, actor.isAdmin ? 1 : 0),
		db.prepare(SELECT_GROUP_SQL).bind(groupId),
		db.prepare(SELECT_SIGNUPS_SQL).bind(groupId),
	]);

	const previousStatus = rowsOf<{ status: GroupStatus }>(results[0])[0]?.status ?? null;
	const state = stateOf(results[2], results[3]);
	if (!state || previousStatus === null) return { outcome: 'NOT_FOUND', state: state ?? null };
	if (previousStatus !== 'OPEN' && previousStatus !== 'FULL') return { outcome: 'ALREADY_CLOSED', state };
	return { outcome: state.group.status === 'CANCELLED' ? 'CANCELLED' : 'FORBIDDEN', state };
}

/**
 * Marks stale runs EXPIRED and returns their final state so the caller can
 * refresh the Discord messages.
 *
 * A run with a resolved start time expires once that time plus a grace period
 * has passed. A run whose start time we could not parse falls back to an
 * age-based cutoff — otherwise it would linger forever.
 */
export async function expireStaleGroups(
	db: D1Database,
	nowSeconds: number,
	graceSeconds: number,
	maxAgeSeconds: number,
	limit: number,
): Promise<GroupState[]> {
	const stale = await db
		.prepare(
			`SELECT * FROM mplus_groups
			 WHERE status IN ('OPEN', 'FULL')
			   AND ((start_ts IS NOT NULL AND start_ts < ?1) OR (start_ts IS NULL AND created_at < ?2))
			 ORDER BY created_at ASC
			 LIMIT ?3`,
		)
		.bind(nowSeconds - graceSeconds, nowSeconds - maxAgeSeconds, limit)
		.all();

	const groups = rowsOf<GroupRow>(stale);
	if (groups.length === 0) return [];

	const ids = groups.map((group) => group.id);
	const placeholders = ids.map((_, index) => `?${index + 1}`).join(', ');
	const results = await db.batch([
		db
			.prepare(
				`UPDATE mplus_groups SET status = 'EXPIRED'
				 WHERE id IN (${placeholders}) AND status IN ('OPEN', 'FULL')
				 RETURNING *`,
			)
			.bind(...ids),
		db.prepare(`SELECT * FROM mplus_signups WHERE group_id IN (${placeholders}) ORDER BY signed_at ASC, id ASC`).bind(...ids),
	]);
	// Another request may have cancelled a group after the stale scan but before
	// this batch. RETURNING includes only rows this sweep actually expired, so a
	// stale snapshot can never overwrite a newer message with an Expired state.
	const expiredGroups = rowsOf<GroupRow>(results[0]);

	const signupsByGroup = new Map<string, SignupRow[]>();
	for (const signup of rowsOf<SignupRow>(results[1])) {
		const bucket = signupsByGroup.get(signup.group_id);
		if (bucket) bucket.push(signup);
		else signupsByGroup.set(signup.group_id, [signup]);
	}

	return expiredGroups.map((group) => ({
		group,
		signups: signupsByGroup.get(group.id) ?? [],
	}));
}
