import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	cancelCraftRequest,
	claimCompletionNotice,
	claimCraftRequest,
	completeCraftRequest,
	deleteCraftRequest,
	expireStaleCraftRequests,
	loadCraftRequest,
	purgeCraftRequestsPastRetention,
	recordCompletionNotice,
	releaseCraftRequest,
	setCraftMessageId,
} from '../src/craft/db';
import { parseQuantity } from '../src/craft/parse';
import { applySchema, seedCraftRequest, user } from './helpers';

const NOW = 1_800_000_000;

beforeEach(async () => {
	await applySchema(env.DB, env.SCHEMA_SQL);
});

describe('parseQuantity', () => {
	it('defaults to 1 when the field is left empty', () => {
		expect(parseQuantity(undefined)).toEqual({ ok: true, value: 1 });
		expect(parseQuantity('   ')).toEqual({ ok: true, value: 1 });
	});

	it('reads a plain number', () => {
		expect(parseQuantity('5')).toEqual({ ok: true, value: 5 });
	});

	it('tolerates the x people type around it', () => {
		expect(parseQuantity('x3')).toEqual({ ok: true, value: 3 });
		expect(parseQuantity('3x')).toEqual({ ok: true, value: 3 });
	});

	it('rejects text that is not a whole number', () => {
		expect(parseQuantity('a few')).toMatchObject({ ok: false });
		expect(parseQuantity('2.5')).toMatchObject({ ok: false });
		expect(parseQuantity('-4')).toMatchObject({ ok: false });
	});

	it('rejects zero', () => {
		expect(parseQuantity('0')).toMatchObject({ ok: false });
	});

	it('rejects an absurd quantity rather than storing it', () => {
		const result = parseQuantity('100000');
		expect(result).toMatchObject({ ok: false });
		if (!result.ok) expect(result.error).toContain('1000');
	});
});

describe('createCraftRequest', () => {
	it('opens the request with nobody assigned', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW });
		expect(request).toMatchObject({
			status: 'OPEN',
			crafter_id: null,
			crafter_name: null,
			claimed_at: null,
			completed_at: null,
			notify_status: null,
			quantity: 1,
		});
	});

	it('stores the submitted URL verbatim, bonus parameters included', async () => {
		const url = 'https://www.wowhead.com/item=222441/charged-claw?bonus=10421:9633';
		const request = await seedCraftRequest(env.DB, { itemUrl: url });
		expect(request.item_url).toBe(url);
	});

	it('keeps every optional field nullable', async () => {
		const request = await seedCraftRequest(env.DB, {
			itemName: null,
			itemIcon: null,
			itemQuality: null,
			characterRealm: null,
			details: null,
		});
		expect(request).toMatchObject({ item_name: null, item_icon: null, item_quality: null, character_realm: null });
	});

	it('records the message id once the post lands', async () => {
		const request = await seedCraftRequest(env.DB);
		await setCraftMessageId(env.DB, request.id, 'message-9');
		expect((await loadCraftRequest(env.DB, request.id))?.message_id).toBe('message-9');
	});

	it('can be deleted outright when the post never happened', async () => {
		const request = await seedCraftRequest(env.DB);
		await deleteCraftRequest(env.DB, request.id);
		expect(await loadCraftRequest(env.DB, request.id)).toBeNull();
	});

	it('refuses a quantity below one at the database level', async () => {
		await expect(seedCraftRequest(env.DB, { quantity: 0 })).rejects.toThrow();
	});
});

describe('claimCraftRequest', () => {
	it('moves an open request to CLAIMED and records the crafter', async () => {
		const request = await seedCraftRequest(env.DB);
		const result = await claimCraftRequest(env.DB, request.id, user('smith', 'Smithy'), NOW);

		expect(result.outcome).toBe('CLAIMED');
		expect(result.request).toMatchObject({
			status: 'CLAIMED',
			crafter_id: 'smith',
			crafter_name: 'Smithy',
			claimed_at: NOW,
		});
	});

	it('gives a contested request to exactly one of two simultaneous claims', async () => {
		const request = await seedCraftRequest(env.DB);

		const [first, second] = await Promise.all([
			claimCraftRequest(env.DB, request.id, user('smithA'), NOW),
			claimCraftRequest(env.DB, request.id, user('smithB'), NOW),
		]);

		expect([first.outcome, second.outcome].sort()).toEqual(['CLAIMED', 'TAKEN']);
		const stored = await loadCraftRequest(env.DB, request.id);
		expect(stored?.status).toBe('CLAIMED');
		// The loser must not have overwritten the winner's name.
		const winner = first.outcome === 'CLAIMED' ? 'smithA' : 'smithB';
		expect(stored?.crafter_id).toBe(winner);
	});

	it('tells the second claimer someone else got there first', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const late = await claimCraftRequest(env.DB, request.id, user('other'), NOW + 10);
		expect(late.outcome).toBe('TAKEN');
		expect(late.request).toMatchObject({ crafter_id: 'smith' });
	});

	it('reports a re-click by the current crafter as a no-op', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		expect((await claimCraftRequest(env.DB, request.id, user('smith'), NOW + 5)).outcome).toBe('ALREADY_YOURS');
	});

	it('refuses to claim a cancelled request', async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		await cancelCraftRequest(env.DB, request.id, { id: 'asker', isAdmin: false });

		const blocked = await claimCraftRequest(env.DB, request.id, user('smith'), NOW);
		expect(blocked.outcome).toBe('CLOSED');
		expect(blocked.request?.crafter_id).toBeNull();
	});

	it('reports NOT_FOUND for a request that no longer exists', async () => {
		expect(await claimCraftRequest(env.DB, 'nope', user('smith'), NOW)).toEqual({ outcome: 'NOT_FOUND', request: null });
	});
});

describe('releaseCraftRequest', () => {
	it('returns a claimed request to the pool', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const released = await releaseCraftRequest(env.DB, request.id, 'smith');
		expect(released.outcome).toBe('RELEASED');
		expect(released.request).toMatchObject({ status: 'OPEN', crafter_id: null, crafter_name: null, claimed_at: null });
	});

	it('lets somebody else claim it afterwards', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);
		await releaseCraftRequest(env.DB, request.id, 'smith');

		expect((await claimCraftRequest(env.DB, request.id, user('other'), NOW + 20)).outcome).toBe('CLAIMED');
	});

	it('refuses a release from anyone but the current crafter', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const refused = await releaseCraftRequest(env.DB, request.id, 'meddler');
		expect(refused.outcome).toBe('NOT_CRAFTER');
		expect(refused.request).toMatchObject({ status: 'CLAIMED', crafter_id: 'smith' });
	});

	it('has nothing to release on an unclaimed request', async () => {
		const request = await seedCraftRequest(env.DB);
		expect((await releaseCraftRequest(env.DB, request.id, 'smith')).outcome).toBe('NOT_CLAIMED');
	});

	it('refuses to reopen a completed request', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);
		await completeCraftRequest(env.DB, request.id, 'smith', NOW + 60);

		const refused = await releaseCraftRequest(env.DB, request.id, 'smith');
		expect(refused.outcome).toBe('CLOSED');
		expect(refused.request?.status).toBe('COMPLETED');
	});
});

describe('completeCraftRequest', () => {
	it('completes a request the actor is currently crafting', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const done = await completeCraftRequest(env.DB, request.id, 'smith', NOW + 60);
		expect(done.outcome).toBe('COMPLETED');
		expect(done.request).toMatchObject({ status: 'COMPLETED', completed_at: NOW + 60, crafter_id: 'smith' });
	});

	it('reports COMPLETED exactly once, however many times it is clicked', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const outcomes = [
			(await completeCraftRequest(env.DB, request.id, 'smith', NOW + 60)).outcome,
			(await completeCraftRequest(env.DB, request.id, 'smith', NOW + 61)).outcome,
			(await completeCraftRequest(env.DB, request.id, 'smith', NOW + 62)).outcome,
		];
		expect(outcomes).toEqual(['COMPLETED', 'ALREADY_COMPLETED', 'ALREADY_COMPLETED']);
		// The first completion time is the one that sticks.
		expect((await loadCraftRequest(env.DB, request.id))?.completed_at).toBe(NOW + 60);
	});

	it('reports COMPLETED to only one of two simultaneous clicks', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const [first, second] = await Promise.all([
			completeCraftRequest(env.DB, request.id, 'smith', NOW + 60),
			completeCraftRequest(env.DB, request.id, 'smith', NOW + 60),
		]);
		expect([first.outcome, second.outcome].sort()).toEqual(['ALREADY_COMPLETED', 'COMPLETED']);
	});

	it('refuses completion from someone who is not the crafter', async () => {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		const refused = await completeCraftRequest(env.DB, request.id, 'meddler', NOW + 60);
		expect(refused.outcome).toBe('NOT_CRAFTER');
		expect(refused.request?.status).toBe('CLAIMED');
	});

	it('refuses completion of a request nobody claimed', async () => {
		const request = await seedCraftRequest(env.DB);
		expect((await completeCraftRequest(env.DB, request.id, 'smith', NOW)).outcome).toBe('NOT_CLAIMED');
	});
});

describe('cancelCraftRequest', () => {
	it('lets the requester cancel while it is still open', async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		const result = await cancelCraftRequest(env.DB, request.id, { id: 'asker', isAdmin: false });
		expect(result.outcome).toBe('CANCELLED');
		expect(result.request?.status).toBe('CANCELLED');
	});

	it('lets the requester cancel after somebody claimed it', async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);

		expect((await cancelCraftRequest(env.DB, request.id, { id: 'asker', isAdmin: false })).outcome).toBe('CANCELLED');
	});

	it('refuses a cancel from an unrelated member', async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		const refused = await cancelCraftRequest(env.DB, request.id, { id: 'randomer', isAdmin: false });
		expect(refused.outcome).toBe('FORBIDDEN');
		expect(refused.request?.status).toBe('OPEN');
	});

	it("lets a moderator cancel someone else's request", async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		expect((await cancelCraftRequest(env.DB, request.id, { id: 'officer', isAdmin: true })).outcome).toBe('CANCELLED');
	});

	it('reports an already-closed request rather than cancelling twice', async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		await cancelCraftRequest(env.DB, request.id, { id: 'asker', isAdmin: false });
		expect((await cancelCraftRequest(env.DB, request.id, { id: 'asker', isAdmin: false })).outcome).toBe('ALREADY_CLOSED');
	});

	it('refuses to cancel a completed request', async () => {
		const request = await seedCraftRequest(env.DB, { requesterId: 'asker' });
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);
		await completeCraftRequest(env.DB, request.id, 'smith', NOW + 60);

		const refused = await cancelCraftRequest(env.DB, request.id, { id: 'asker', isAdmin: false });
		expect(refused.outcome).toBe('ALREADY_CLOSED');
		expect(refused.request?.status).toBe('COMPLETED');
	});
});

describe('claimCompletionNotice', () => {
	async function completed(): Promise<string> {
		const request = await seedCraftRequest(env.DB);
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);
		await completeCraftRequest(env.DB, request.id, 'smith', NOW + 60);
		return request.id;
	}

	it('is won by exactly one caller', async () => {
		const id = await completed();
		expect(await claimCompletionNotice(env.DB, id, NOW + 60)).toBe(true);
		expect(await claimCompletionNotice(env.DB, id, NOW + 61)).toBe(false);
	});

	it('is won by exactly one of two simultaneous callers', async () => {
		const id = await completed();
		const results = await Promise.all([
			claimCompletionNotice(env.DB, id, NOW + 60),
			claimCompletionNotice(env.DB, id, NOW + 60),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('stays claimed once the outcome has been recorded', async () => {
		const id = await completed();
		await claimCompletionNotice(env.DB, id, NOW + 60);
		await recordCompletionNotice(env.DB, id, 'DM_SENT');

		expect(await claimCompletionNotice(env.DB, id, NOW + 90)).toBe(false);
		expect((await loadCraftRequest(env.DB, id))?.notify_status).toBe('DM_SENT');
	});

	it('cannot be claimed for a request that is not complete', async () => {
		const request = await seedCraftRequest(env.DB);
		expect(await claimCompletionNotice(env.DB, request.id, NOW)).toBe(false);
	});

	it('records the moment the notice was taken on', async () => {
		const id = await completed();
		await claimCompletionNotice(env.DB, id, NOW + 60);
		expect((await loadCraftRequest(env.DB, id))?.notified_at).toBe(NOW + 60);
	});
});

describe('expireStaleCraftRequests', () => {
	const MAX_AGE = 14 * 24 * 3600;

	it('expires an unfinished request past the age cutoff', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW - MAX_AGE - 60 });
		const expired = await expireStaleCraftRequests(env.DB, NOW, MAX_AGE, 40);

		expect(expired.map((row) => row.id)).toEqual([request.id]);
		expect((await loadCraftRequest(env.DB, request.id))?.status).toBe('EXPIRED');
	});

	it('expires a claimed request nobody ever finished', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW - MAX_AGE - 60 });
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW - MAX_AGE);

		expect(await expireStaleCraftRequests(env.DB, NOW, MAX_AGE, 40)).toHaveLength(1);
	});

	it('leaves a recent request alone', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW - 3600 });
		expect(await expireStaleCraftRequests(env.DB, NOW, MAX_AGE, 40)).toEqual([]);
		expect((await loadCraftRequest(env.DB, request.id))?.status).toBe('OPEN');
	});

	it('does not touch requests that are already finished', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW - MAX_AGE - 60 });
		await claimCraftRequest(env.DB, request.id, user('smith'), NOW);
		await completeCraftRequest(env.DB, request.id, 'smith', NOW);

		expect(await expireStaleCraftRequests(env.DB, NOW, MAX_AGE, 40)).toEqual([]);
		expect((await loadCraftRequest(env.DB, request.id))?.status).toBe('COMPLETED');
	});

	it('returns the rows it expired so their messages can be rewritten', async () => {
		await seedCraftRequest(env.DB, { createdAt: NOW - MAX_AGE - 60, messageId: 'message-1' });
		const [expired] = await expireStaleCraftRequests(env.DB, NOW, MAX_AGE, 40);
		expect(expired).toMatchObject({ status: 'EXPIRED', message_id: 'message-1' });
	});

	it('honours the sweep limit', async () => {
		for (let index = 0; index < 3; index++) {
			await seedCraftRequest(env.DB, { createdAt: NOW - MAX_AGE - 60 + index });
		}
		expect(await expireStaleCraftRequests(env.DB, NOW, MAX_AGE, 2)).toHaveLength(2);
	});
});

describe('purgeCraftRequestsPastRetention', () => {
	const RETENTION = 30 * 24 * 3600;

	async function count(): Promise<number> {
		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM craft_requests').first<{ n: number }>();
		return row?.n ?? 0;
	}

	it('deletes a request past the retention window', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW - RETENTION - 60 });
		expect(await purgeCraftRequestsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(1);
		expect(await loadCraftRequest(env.DB, request.id)).toBeNull();
	});

	it('keeps a request inside the window', async () => {
		await seedCraftRequest(env.DB, { createdAt: NOW - 3600 });
		expect(await purgeCraftRequestsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(0);
		expect(await count()).toBe(1);
	});

	it('deletes on age alone, so a request the expiry sweep missed is still cleaned up', async () => {
		const request = await seedCraftRequest(env.DB, { createdAt: NOW - RETENTION - 60 });
		expect((await loadCraftRequest(env.DB, request.id))?.status).toBe('OPEN');
		expect(await purgeCraftRequestsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(1);
	});

	it('honours the purge limit', async () => {
		for (let index = 0; index < 3; index++) {
			await seedCraftRequest(env.DB, { createdAt: NOW - RETENTION - 60 + index });
		}
		expect(await purgeCraftRequestsPastRetention(env.DB, NOW, RETENTION, 2)).toBe(2);
		expect(await count()).toBe(1);
	});

	it('leaves LFG data and guild configuration alone', async () => {
		await seedCraftRequest(env.DB, { createdAt: NOW - RETENTION - 60 });
		await purgeCraftRequestsPastRetention(env.DB, NOW, RETENTION, 500);

		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_groups').first<{ n: number }>()).toEqual({ n: 0 });
	});
});

describe('craft mutations against LFG data', () => {
	it('does not confuse a group id with a craft request id', async () => {
		const request = await seedCraftRequest(env.DB);
		expect(await loadCraftRequest(env.DB, 'some-group-id')).toBeNull();
		expect(await loadCraftRequest(env.DB, request.id)).not.toBeNull();
	});
});
