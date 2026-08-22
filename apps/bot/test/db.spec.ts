import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { getGuildConfig, setGuildConfig } from '../src/guildConfig';
import {
	cancelGroup,
	expireStaleGroups,
	joinGroup,
	leaveGroup,
	loadState,
	purgeGroupsPastRetention,
} from '../src/lfg/db';
import { applySchema, seedGroup, user } from './helpers';

const NOW = 1_800_000_000;

beforeEach(async () => {
	await applySchema(env.DB, env.SCHEMA_SQL);
});

function rosterOf(signups: Array<{ user_id: string; role: string }>): Record<string, string> {
	return Object.fromEntries(signups.map((signup) => [signup.user_id, signup.role]));
}

describe('guild configuration', () => {
	it('stores one row per guild and replaces it on update', async () => {
		expect(await getGuildConfig(env.DB, 'guild')).toBeNull();

		await setGuildConfig(env.DB, { guildId: 'guild', channelId: 'channel-1', timezone: 'America/Chicago' });
		await setGuildConfig(env.DB, { guildId: 'guild', channelId: 'channel-2', timezone: 'Europe/Paris' });

		expect(await getGuildConfig(env.DB, 'guild')).toEqual({
			guild_id: 'guild',
			channel_id: 'channel-2',
			timezone: 'Europe/Paris',
			craft_channel_id: null,
			crafter_role_id: null,
		});
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_guild_config').first<{ n: number }>()).toEqual({ n: 1 });
	});

	it('defaults the timezone to UTC for a row that predates the column', async () => {
		await env.DB.prepare("INSERT INTO mplus_guild_config (guild_id, channel_id) VALUES ('old', 'channel')").run();
		expect(await getGuildConfig(env.DB, 'old')).toEqual({
			guild_id: 'old',
			channel_id: 'channel',
			timezone: 'UTC',
			craft_channel_id: null,
			crafter_role_id: null,
		});
	});

	it('reads an LFG-only guild back with crafting simply turned off', async () => {
		await setGuildConfig(env.DB, { guildId: 'lfg-only', channelId: 'channel', timezone: 'UTC' });
		const config = await getGuildConfig(env.DB, 'lfg-only');
		expect(config).toMatchObject({ craft_channel_id: null, crafter_role_id: null });
	});

	it('stores and clears the crafting channel and crafter role', async () => {
		await setGuildConfig(env.DB, {
			guildId: 'guild',
			channelId: 'channel',
			timezone: 'UTC',
			craftChannelId: 'craft-channel',
			crafterRoleId: 'crafter-role',
		});
		expect(await getGuildConfig(env.DB, 'guild')).toMatchObject({
			craft_channel_id: 'craft-channel',
			crafter_role_id: 'crafter-role',
		});

		await setGuildConfig(env.DB, { guildId: 'guild', channelId: 'channel', timezone: 'UTC' });
		expect(await getGuildConfig(env.DB, 'guild')).toMatchObject({ craft_channel_id: null, crafter_role_id: null });
	});
});

describe('createGroup', () => {
	it('opens the run with the creator already slotted in', async () => {
		const { group, signups } = await seedGroup(env.DB, { creatorRole: 'HEALER' });
		expect(group.status).toBe('OPEN');
		expect(signups).toHaveLength(1);
		expect(signups[0]).toMatchObject({ user_id: 'creator', role: 'HEALER' });
	});

	it('is immediately FULL when the composition is a solo run', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK', composition: { TANK: 1, HEALER: 0, DPS: 0 } });
		expect(group.status).toBe('FULL');
	});
});

describe('joinGroup', () => {
	it('adds a player and flips the run to FULL once every slot is taken', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });

		expect((await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW)).outcome).toBe('JOINED');
		expect((await joinGroup(env.DB, group.id, user('dps1'), 'DPS', NOW)).outcome).toBe('JOINED');
		expect((await joinGroup(env.DB, group.id, user('dps2'), 'DPS', NOW)).outcome).toBe('JOINED');

		const last = await joinGroup(env.DB, group.id, user('dps3'), 'DPS', NOW);
		expect(last.outcome).toBe('JOINED');
		expect(last.state?.group.status).toBe('FULL');
	});

	it('refuses a role that is already at capacity and leaves the roster untouched', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW);

		const rejected = await joinGroup(env.DB, group.id, user('healer2'), 'HEALER', NOW);
		expect(rejected.outcome).toBe('ROLE_FULL');
		expect(rosterOf(rejected.state?.signups ?? [])).toEqual({ creator: 'TANK', healer: 'HEALER' });
	});

	it('switches an existing player between roles without duplicating them', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		await joinGroup(env.DB, group.id, user('alice'), 'DPS', NOW);

		const switched = await joinGroup(env.DB, group.id, user('alice'), 'HEALER', NOW + 5);
		expect(switched.outcome).toBe('SWITCHED');
		expect(rosterOf(switched.state?.signups ?? [])).toEqual({ creator: 'TANK', alice: 'HEALER' });
	});

	it('reports a no-op when the player re-clicks the role they already hold', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		const again = await joinGroup(env.DB, group.id, user('creator'), 'TANK', NOW);
		expect(again.outcome).toBe('ALREADY_IN_ROLE');
		expect(again.state?.signups).toHaveLength(1);
	});

	it('keeps the player in their old role when the target role is full', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW);
		await joinGroup(env.DB, group.id, user('alice'), 'DPS', NOW);

		const blocked = await joinGroup(env.DB, group.id, user('alice'), 'HEALER', NOW);
		expect(blocked.outcome).toBe('ROLE_FULL');
		expect(rosterOf(blocked.state?.signups ?? [])).toMatchObject({ alice: 'DPS' });
	});

	it('gives a contested slot to exactly one of two simultaneous clicks', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'DPS', composition: { TANK: 1, HEALER: 1, DPS: 3 } });

		const [first, second] = await Promise.all([
			joinGroup(env.DB, group.id, user('tankA'), 'TANK', NOW),
			joinGroup(env.DB, group.id, user('tankB'), 'TANK', NOW),
		]);

		const outcomes = [first.outcome, second.outcome].sort();
		expect(outcomes).toEqual(['JOINED', 'ROLE_FULL']);

		const state = await loadState(env.DB, group.id);
		expect(state?.signups.filter((signup) => signup.role === 'TANK')).toHaveLength(1);
	});

	it('rejects sign-ups once the run is cancelled', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		await cancelGroup(env.DB, group.id, { id: 'creator', isAdmin: false });

		const blocked = await joinGroup(env.DB, group.id, user('late'), 'DPS', NOW);
		expect(blocked.outcome).toBe('CLOSED');
		expect(blocked.state?.signups).toHaveLength(1);
	});

	it('counts pre-filled slots against capacity', async () => {
		// Creator is the tank, healer and one dps are a premade: only 2 dps open.
		const { group } = await seedGroup(env.DB, {
			creatorRole: 'TANK',
			reserved: { TANK: 0, HEALER: 1, DPS: 1 },
		});

		expect((await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW)).outcome).toBe('ROLE_FULL');
		expect((await joinGroup(env.DB, group.id, user('dps1'), 'DPS', NOW)).outcome).toBe('JOINED');

		const last = await joinGroup(env.DB, group.id, user('dps2'), 'DPS', NOW);
		expect(last.outcome).toBe('JOINED');
		// 1 tank (creator) + 1 reserved healer + 1 reserved dps + 2 sign-ups = 5.
		expect(last.state?.group.status).toBe('FULL');

		expect((await joinGroup(env.DB, group.id, user('dps3'), 'DPS', NOW)).outcome).toBe('ROLE_FULL');
	});

	it('is FULL on creation when the premade fills everything but the creator', async () => {
		const { group } = await seedGroup(env.DB, {
			creatorRole: 'TANK',
			reserved: { TANK: 0, HEALER: 1, DPS: 3 },
		});
		expect(group.status).toBe('FULL');
	});

	it('reports NOT_FOUND for a run that no longer exists', async () => {
		const missing = await joinGroup(env.DB, 'no-such-group', user('alice'), 'DPS', NOW);
		expect(missing).toEqual({ outcome: 'NOT_FOUND', state: null });
	});
});

describe('leaveGroup', () => {
	it('reopens a full run when someone drops out', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK', composition: { TANK: 1, HEALER: 1, DPS: 0 } });
		const full = await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW);
		expect(full.state?.group.status).toBe('FULL');

		const left = await leaveGroup(env.DB, group.id, 'healer');
		expect(left.outcome).toBe('LEFT');
		expect(left.state?.group.status).toBe('OPEN');
		expect(left.state?.signups).toHaveLength(1);
	});

	it('reopens the slot a sign-up vacated without freeing a pre-filled one', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK', reserved: { TANK: 0, HEALER: 1, DPS: 2 } });
		const joined = await joinGroup(env.DB, group.id, user('dps1'), 'DPS', NOW);
		expect(joined.state?.group.status).toBe('FULL');

		const left = await leaveGroup(env.DB, group.id, 'dps1');
		expect(left.state?.group.status).toBe('OPEN');
		// The two reserved dps slots stay reserved; only the vacated one is open.
		expect((await joinGroup(env.DB, group.id, user('dps2'), 'DPS', NOW)).outcome).toBe('JOINED');
		expect((await joinGroup(env.DB, group.id, user('dps3'), 'DPS', NOW)).outcome).toBe('ROLE_FULL');
	});

	it('is a no-op for someone who never signed up', async () => {
		const { group } = await seedGroup(env.DB);
		const result = await leaveGroup(env.DB, group.id, 'stranger');
		expect(result.outcome).toBe('NOT_SIGNED_UP');
		expect(result.state?.signups).toHaveLength(1);
	});

	it('lets the leader drop their own slot without cancelling the run', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator', creatorRole: 'TANK' });
		const result = await leaveGroup(env.DB, group.id, 'creator');
		expect(result.outcome).toBe('LEFT');
		expect(result.state?.group.status).toBe('OPEN');
		expect(result.state?.signups).toHaveLength(0);
	});
});

describe('cancelGroup', () => {
	it('lets the creator cancel', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		const result = await cancelGroup(env.DB, group.id, { id: 'creator', isAdmin: false });
		expect(result.outcome).toBe('CANCELLED');
		expect(result.state?.group.status).toBe('CANCELLED');
	});

	it('refuses a non-creator without moderator permissions', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		const result = await cancelGroup(env.DB, group.id, { id: 'randomer', isAdmin: false });
		expect(result.outcome).toBe('FORBIDDEN');
		expect(result.state?.group.status).toBe('OPEN');
	});

	it("lets a moderator cancel someone else's run", async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		const result = await cancelGroup(env.DB, group.id, { id: 'officer', isAdmin: true });
		expect(result.outcome).toBe('CANCELLED');
	});

	it('reports an already-closed run rather than cancelling twice', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		await cancelGroup(env.DB, group.id, { id: 'creator', isAdmin: false });
		const again = await cancelGroup(env.DB, group.id, { id: 'creator', isAdmin: false });
		expect(again.outcome).toBe('ALREADY_CLOSED');
	});
});

describe('expireStaleGroups', () => {
	const GRACE = 1800;
	const MAX_AGE = 4 * 3600;

	it('expires a run whose start time is past the grace period', async () => {
		const { group } = await seedGroup(env.DB, { startTs: NOW - GRACE - 60, createdAt: NOW - 7200 });
		const expired = await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40);

		expect(expired.map((state) => state.group.id)).toEqual([group.id]);
		expect((await loadState(env.DB, group.id))?.group.status).toBe('EXPIRED');
	});

	it('leaves a scheduled run alone while it is still inside the grace period', async () => {
		const { group } = await seedGroup(env.DB, { startTs: NOW - 60, createdAt: NOW - 7200 });
		expect(await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40)).toEqual([]);
		expect((await loadState(env.DB, group.id))?.group.status).toBe('OPEN');
	});

	it('leaves a run scheduled for tomorrow alone even if it was posted hours ago', async () => {
		const { group } = await seedGroup(env.DB, { startTs: NOW + 86400, createdAt: NOW - MAX_AGE - 60 });
		expect(await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40)).toEqual([]);
		expect((await loadState(env.DB, group.id))?.group.status).toBe('OPEN');
	});

	it('falls back to an age cutoff when the start time was never parsed', async () => {
		const { group } = await seedGroup(env.DB, { startTs: null, createdAt: NOW - MAX_AGE - 60 });
		const expired = await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40);
		expect(expired.map((state) => state.group.id)).toEqual([group.id]);
	});

	it('keeps an undated run that is still young', async () => {
		await seedGroup(env.DB, { startTs: null, createdAt: NOW - 60 });
		expect(await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40)).toEqual([]);
	});

	it('returns the roster alongside each expired run so messages can be rewritten', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK', startTs: NOW - GRACE - 60 });
		await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW);

		const [expired] = await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40);
		expect(expired.group.status).toBe('EXPIRED');
		expect(rosterOf(expired.signups)).toEqual({ creator: 'TANK', healer: 'HEALER' });
	});

	it('does not touch runs that are already cancelled', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator', startTs: NOW - GRACE - 60 });
		await cancelGroup(env.DB, group.id, { id: 'creator', isAdmin: false });

		expect(await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 40)).toEqual([]);
		expect((await loadState(env.DB, group.id))?.group.status).toBe('CANCELLED');
	});

	it('honours the sweep limit', async () => {
		for (let index = 0; index < 3; index++) {
			await seedGroup(env.DB, { startTs: NOW - GRACE - 60, createdAt: NOW - 7200 + index });
		}
		expect(await expireStaleGroups(env.DB, NOW, GRACE, MAX_AGE, 2)).toHaveLength(2);
	});
});

describe('purgeGroupsPastRetention', () => {
	const RETENTION = 24 * 3600;

	async function groupCount(): Promise<number> {
		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_groups').first<{ n: number }>();
		return row?.n ?? 0;
	}

	async function signupCount(): Promise<number> {
		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_signups').first<{ n: number }>();
		return row?.n ?? 0;
	}

	it('deletes a run once its start time is past the retention window', async () => {
		const { group } = await seedGroup(env.DB, { startTs: NOW - RETENTION - 60, createdAt: NOW - RETENTION - 3600 });

		expect(await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(1);
		expect(await loadState(env.DB, group.id)).toBeNull();
	});

	it('takes the roster with it', async () => {
		const { group } = await seedGroup(env.DB, { startTs: NOW - RETENTION - 60, createdAt: NOW - RETENTION - 3600 });
		await joinGroup(env.DB, group.id, user('healer'), 'HEALER', NOW - RETENTION - 30);
		expect(await signupCount()).toBe(2);

		await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500);
		expect(await signupCount()).toBe(0);
	});

	it('keeps a run that started recently', async () => {
		await seedGroup(env.DB, { startTs: NOW - 3600, createdAt: NOW - 7200 });
		expect(await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(0);
		expect(await groupCount()).toBe(1);
	});

	it('keeps a run scheduled for next week no matter how long ago it was posted', async () => {
		await seedGroup(env.DB, { startTs: NOW + 7 * 86400, createdAt: NOW - RETENTION - 86400 });
		expect(await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(0);
		expect(await groupCount()).toBe(1);
	});

	it('falls back to the post time when the start time was never parsed', async () => {
		await seedGroup(env.DB, { startTs: null, createdAt: NOW - RETENTION - 60 });
		await seedGroup(env.DB, { startTs: null, createdAt: NOW - 60 });

		expect(await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(1);
		expect(await groupCount()).toBe(1);
	});

	it('deletes on age alone, so a run the expiry sweep missed is still cleaned up', async () => {
		const { group } = await seedGroup(env.DB, { startTs: NOW - RETENTION - 60, createdAt: NOW - RETENTION - 3600 });
		expect((await loadState(env.DB, group.id))?.group.status).toBe('OPEN');

		expect(await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500)).toBe(1);
	});

	it('leaves guild configuration alone', async () => {
		await setGuildConfig(env.DB, { guildId: 'guild', channelId: 'channel', timezone: 'America/Chicago' });
		await seedGroup(env.DB, { startTs: NOW - RETENTION - 60, createdAt: NOW - RETENTION - 3600 });

		await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 500);
		expect(await getGuildConfig(env.DB, 'guild')).not.toBeNull();
	});

	it('honours the purge limit without orphaning a roster', async () => {
		for (let index = 0; index < 3; index++) {
			await seedGroup(env.DB, { startTs: NOW - RETENTION - 60 + index, createdAt: NOW - RETENTION - 3600 });
		}

		expect(await purgeGroupsPastRetention(env.DB, NOW, RETENTION, 2)).toBe(2);
		expect(await groupCount()).toBe(1);
		// Each seeded run has exactly one signup: the creator.
		expect(await signupCount()).toBe(1);
	});
});
