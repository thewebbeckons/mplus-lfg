import { createExecutionContext, env, fetchMock, waitOnExecutionContext } from 'cloudflare:test';
import { InteractionContextType, InteractionResponseType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { joinId } from '../src/lfg/customId';
import { COMMANDS } from '../src/commands';
import { getGuildConfig, setGuildConfig } from '../src/guildConfig';
import { loadState } from '../src/lfg/db';
import worker, { purgeOldRuns, sweepExpiredGroups } from '../src/index';
import type { GroupRow } from '../src/lfg/types';
import {
	CHANNEL_ID,
	CRAFTER_ROLE_ID,
	CRAFT_CHANNEL_ID,
	GUILD_ID,
	IncomingRequest,
	OTHER_CHANNEL_ID,
	applySchema,
	buttonInteraction,
	commandInteraction,
	configureCraftingGuild,
	configureGuild,
	createSigningKey,
	modalInteraction,
	seedGroup,
	setupModalInteraction,
	signedInteraction,
	TIMEZONE,
} from './helpers';
import type { SigningKey } from './helpers';

const ORIGINAL_MESSAGE_PATH = '/api/v10/webhooks/000000000000000001/interaction-token/messages/@original';

let key: SigningKey;

beforeAll(async () => {
	key = await createSigningKey();
	// The Worker verifies against whatever is bound; point it at our test key.
	env.DISCORD_PUBLIC_KEY = key.publicKeyHex;
	fetchMock.activate();
	fetchMock.disableNetConnect();
});

beforeEach(async () => {
	await applySchema(env.DB, env.SCHEMA_SQL);
	await configureGuild(env.DB);
});

afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
});

async function post(payload: unknown): Promise<{ response: Response; body: any }> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(await signedInteraction(key, payload), env, ctx);
	// Settles the ctx.waitUntil work (message id capture, background refreshes).
	await waitOnExecutionContext(ctx);
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

describe('request handling', () => {
	it("answers Discord's PING with a PONG", async () => {
		const { response, body } = await post({ type: 1 });
		expect(response.status).toBe(200);
		expect(body).toEqual({ type: InteractionResponseType.Pong });
	});

	it('rejects an unsigned request with 401 so Discord will not save the endpoint', async () => {
		const ctx = createExecutionContext();
		const request = new IncomingRequest('https://example.com/interactions', { method: 'POST', body: '{"type":1}' });
		const response = await worker.fetch(request, env, ctx);
		expect(response.status).toBe(401);
	});

	it('rejects a signature that does not match the body', async () => {
		const request = await signedInteraction(key, { type: 1 });
		const tampered = new IncomingRequest(request, { body: '{"type":2}' });
		const response = await worker.fetch(tampered, env, createExecutionContext());
		expect(response.status).toBe(401);
	});

	it('serves a health check and 404s everything else', async () => {
		const ctx = createExecutionContext();
		expect((await worker.fetch(new IncomingRequest('https://example.com/health'), env, ctx)).status).toBe(200);
		expect((await worker.fetch(new IncomingRequest('https://example.com/nope'), env, ctx)).status).toBe(404);
	});
});

describe('command registration', () => {
	it('registers setup and settings as Manage Server commands', () => {
		expect(COMMANDS.map((command) => command.name)).toEqual(['lfg', 'craft', 'setup', 'settings']);
		for (const name of ['setup', 'settings']) {
			expect(COMMANDS.find((command) => command.name === name)?.default_member_permissions).toBe(
				PermissionFlagsBits.ManageGuild.toString(),
			);
		}
	});

	it('leaves /lfg and /craft usable by everyone, in guilds only', () => {
		for (const name of ['lfg', 'craft']) {
			const command = COMMANDS.find((entry) => entry.name === name);
			expect(command?.default_member_permissions).toBeUndefined();
			expect(command?.contexts).toEqual([InteractionContextType.Guild]);
		}
	});

	it("keeps every description inside Discord's 100 character limit", () => {
		for (const command of COMMANDS) {
			// Only chat input commands carry a description; all of ours are.
			const description = 'description' in command ? command.description : '';
			expect(description.length).toBeGreaterThan(0);
			expect(description.length).toBeLessThanOrEqual(100);
		}
	});
});

describe('/lfg', () => {
	it('opens the run creation modal', async () => {
		const { body } = await post(commandInteraction('creator'));
		expect(body.type).toBe(InteractionResponseType.Modal);
		expect(body.data.custom_id).toBe('mplus:create');
		expect(body.data.components.map((label: any) => label.component.custom_id)).toEqual([
			'activity',
			'start_time',
			'role',
			'comp',
			'notes',
		]);
		const role = body.data.components[2];
		expect(role).toMatchObject({
			type: 18,
			label: 'Your role',
			component: {
				type: 3,
				custom_id: 'role',
				required: false,
				min_values: 0,
				max_values: 1,
			},
		});
		expect(role.component.options.map((option: any) => option.value)).toEqual(['TANK', 'HEALER', 'DPS']);
		expect(role.component.options.find((option: any) => option.default)?.value).toBe('DPS');
	});

	it('tells the creator which timezone a bare start time will be read in', async () => {
		await configureGuild(env.DB, { timezone: 'America/Chicago' });

		const { body } = await post(commandInteraction('creator'));

		const startTime = body.data.components[1];
		expect(startTime.component.custom_id).toBe('start_time');
		expect(startTime.description).toBe('Read as America/Chicago unless you name a zone, e.g. "8pm EST".');
		// A Label description holds 100 characters.
		expect(startTime.description.length).toBeLessThanOrEqual(100);
	});

	it('explains how to finish setup when the server has no LFG channel', async () => {
		await env.DB.prepare('DELETE FROM mplus_guild_config WHERE guild_id = ?1').bind(GUILD_ID).run();

		const { body } = await post(commandInteraction('creator'));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toBe("This server hasn't finished LFG setup yet. A server admin can run `/setup` to get started.");
	});

	it('redirects commands used outside the configured channel', async () => {
		await setGuildConfig(env.DB, { guildId: GUILD_ID, channelId: OTHER_CHANNEL_ID, timezone: TIMEZONE });

		const { body } = await post(commandInteraction('creator'));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toBe(
			`LFG commands are available in <#${OTHER_CHANNEL_ID}>. Head over there to create or browse groups.`,
		);
	});
});

describe('/setup and /settings', () => {
	it('opens a text-channel-only picker for a Manage Server user', async () => {
		await env.DB.prepare('DELETE FROM mplus_guild_config WHERE guild_id = ?1').bind(GUILD_ID).run();

		const { body } = await post(commandInteraction('admin', { name: 'setup', permissions: 'manageGuild' }));

		expect(body.type).toBe(InteractionResponseType.Modal);
		expect(body.data).toMatchObject({ custom_id: 'mplus:setup', title: 'Set up Guild Helper' });
		expect(body.data.components[0]).toMatchObject({
			type: 18,
			component: {
				type: 8,
				custom_id: 'lfg_channel',
				channel_types: [0],
				required: true,
				min_values: 1,
				max_values: 1,
			},
		});
		expect(body.data.components[0].component.default_values).toBeUndefined();
		expect(body.data.components[2]).toMatchObject({
			type: 18,
			component: { type: 3, custom_id: 'lfg_timezone', required: true, min_values: 1, max_values: 1 },
		});
		// A select menu holds at most 25 options.
		expect(body.data.components[2].component.options.length).toBeLessThanOrEqual(25);
		expect(body.data.components[2].component.options.some((option: { default?: boolean }) => option.default)).toBe(false);
	});

	it('offers optional crafting channel and crafter role pickers', async () => {
		const { body } = await post(commandInteraction('admin', { name: 'setup', permissions: 'manageGuild' }));

		// A modal holds at most 5 top-level components.
		expect(body.data.components).toHaveLength(4);
		expect(body.data.components[1]).toMatchObject({
			type: 18,
			component: { type: 8, custom_id: 'craft_channel', channel_types: [0], required: false, min_values: 0 },
		});
		expect(body.data.components[3]).toMatchObject({
			type: 18,
			component: { type: 6, custom_id: 'crafter_role', required: false, min_values: 0 },
		});
	});

	it('preselects a configured crafting channel and crafter role', async () => {
		await configureCraftingGuild(env.DB, { crafterRoleId: CRAFTER_ROLE_ID });

		const { body } = await post(commandInteraction('admin', { name: 'settings', permissions: 'manageGuild' }));

		expect(body.data.components[1].component.default_values).toEqual([{ id: CRAFT_CHANNEL_ID, type: 'channel' }]);
		expect(body.data.components[3].component.default_values).toEqual([{ id: CRAFTER_ROLE_ID, type: 'role' }]);
	});

	it('preselects the current channel when settings are reopened', async () => {
		const { body } = await post(commandInteraction('admin', { name: 'settings', permissions: 'moderator' }));

		expect(body.type).toBe(InteractionResponseType.Modal);
		expect(body.data.title).toBe('Server settings');
		expect(body.data.components[0].component.default_values).toEqual([{ id: CHANNEL_ID, type: 'channel' }]);
		expect(body.data.components[2].component.options).toContainEqual({
			label: expect.stringContaining('Toronto'),
			value: TIMEZONE,
			default: true,
		});
		// Optional on a reopen, so leaving the shown default untouched keeps it.
		expect(body.data.components[2].component).toMatchObject({ required: false, min_values: 0 });
	});

	it('rejects users without Manage Server or Administrator', async () => {
		const { body } = await post(commandInteraction('member', { name: 'setup' }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('Manage Server');
	});

	it('saves the selected channel and timezone, and confirms privately', async () => {
		const { body } = await post(setupModalInteraction('admin', OTHER_CHANNEL_ID, { permissions: 'manageGuild' }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(
			`LFG posts will use <#${OTHER_CHANNEL_ID}>, and start times will be read as **America/Chicago**.`,
		);
		expect(await getGuildConfig(env.DB, GUILD_ID)).toEqual({
			guild_id: GUILD_ID,
			channel_id: OTHER_CHANNEL_ID,
			timezone: 'America/Chicago',
			craft_channel_id: null,
			crafter_role_id: null,
		});
	});

	it('keeps the saved timezone when only the channel is changed', async () => {
		const { body } = await post(
			setupModalInteraction('admin', OTHER_CHANNEL_ID, { permissions: 'manageGuild', timezone: null }),
		);

		expect(body.data.content).toContain(`**${TIMEZONE}**`);
		expect(await getGuildConfig(env.DB, GUILD_ID)).toMatchObject({
			channel_id: OTHER_CHANNEL_ID,
			timezone: TIMEZONE,
		});
	});

	it('refuses a first-time setup that names no timezone', async () => {
		await env.DB.prepare('DELETE FROM mplus_guild_config WHERE guild_id = ?1').bind(GUILD_ID).run();

		const { body } = await post(
			setupModalInteraction('admin', OTHER_CHANNEL_ID, { permissions: 'manageGuild', timezone: null }),
		);

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toBe('Choose a timezone before saving LFG setup.');
		expect(await getGuildConfig(env.DB, GUILD_ID)).toBeNull();
	});

	it('lets a guild whose saved zone is no longer offered still change channel', async () => {
		await env.DB.prepare('UPDATE mplus_guild_config SET timezone = ?2 WHERE guild_id = ?1')
			.bind(GUILD_ID, 'Antarctica/Troll')
			.run();

		const { body } = await post(
			setupModalInteraction('admin', OTHER_CHANNEL_ID, { permissions: 'manageGuild', timezone: null }),
		);

		expect(body.data.content).toContain('**Antarctica/Troll**');
		expect(await getGuildConfig(env.DB, GUILD_ID)).toMatchObject({
			channel_id: OTHER_CHANNEL_ID,
			timezone: 'Antarctica/Troll',
		});
	});

	it('refuses a timezone the modal never offered', async () => {
		const { body } = await post(
			setupModalInteraction('admin', OTHER_CHANNEL_ID, { permissions: 'manageGuild', timezone: 'Mars/Orgrimmar' }),
		);

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toBe('Choose a timezone before saving LFG setup.');
		expect((await getGuildConfig(env.DB, GUILD_ID))?.channel_id).toBe(CHANNEL_ID);
	});

	it('rechecks permissions when the setup modal is submitted', async () => {
		const { body } = await post(setupModalInteraction('member', OTHER_CHANNEL_ID, { permissions: 'none' }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect((await getGuildConfig(env.DB, GUILD_ID))?.channel_id).toBe(CHANNEL_ID);
	});
});

describe('modal submission', () => {
	const fields = {
		activity: 'Grim Batol +11',
		start_time: 'in 30 mins',
		role: 'tank',
		comp: '1/1/3',
		notes: 'Voice required',
	};

	it('creates the run, posts it publicly, and records the message id', async () => {
		fetchMock.get('https://discord.com').intercept({ method: 'GET', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		const { body } = await post(modalInteraction('creator', fields));

		expect(body.type).toBe(InteractionResponseType.ChannelMessageWithSource);
		expect(body.data.embeds[0].title).toContain('Grim Batol +11');
		// Roster mentions must render as names without pinging anyone.
		expect(body.data.allowed_mentions).toEqual({ parse: [] });

		const stored = await env.DB.prepare('SELECT * FROM mplus_groups').first<GroupRow>();
		expect(stored).toMatchObject({
			activity: 'Grim Batol +11',
			creator_id: 'creator',
			channel_id: CHANNEL_ID,
			status: 'OPEN',
			message_id: 'message-1',
		});

		const state = await loadState(env.DB, stored!.id);
		expect(state?.signups).toMatchObject([{ user_id: 'creator', role: 'TANK' }]);
	});

	it('still creates the run when Discord will not tell us the message id', async () => {
		fetchMock.get('https://discord.com').intercept({ method: 'GET', path: ORIGINAL_MESSAGE_PATH }).reply(500, 'boom');

		const { body } = await post(modalInteraction('creator', fields));
		expect(body.type).toBe(InteractionResponseType.ChannelMessageWithSource);

		const stored = await env.DB.prepare('SELECT * FROM mplus_groups').first<GroupRow>();
		expect(stored?.message_id).toBeNull();
	});

	it('uses DPS when the displayed default is submitted without a changed select value', async () => {
		fetchMock.get('https://discord.com').intercept({ method: 'GET', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		const { body } = await post(modalInteraction('creator', { ...fields, role: '' }));

		expect(body.type).toBe(InteractionResponseType.ChannelMessageWithSource);
		const state = await loadState(env.DB, (await env.DB.prepare('SELECT id FROM mplus_groups').first<{ id: string }>())!.id);
		expect(state?.signups).toMatchObject([{ user_id: 'creator', role: 'DPS' }]);
	});

	it('posts a partly pre-filled run when the creator already has people', async () => {
		fetchMock.get('https://discord.com').intercept({ method: 'GET', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		const { body } = await post(modalInteraction('creator', { ...fields, role: 'tank', comp: 'LF 2 DPS' }));

		const embedFields = Object.fromEntries(body.data.embeds[0].fields.map((field: any) => [field.name, field.value]));
		expect(embedFields['🛡️ Tank 1/1']).toBe('<@creator>');
		expect(embedFields['💚 Healer 1/1']).toBe('`— premade —`');
		expect(embedFields['⚔️ DPS 1/3']).toBe('`— premade —`\n`— open —`\n`— open —`');
		expect(body.data.embeds[0].description).toContain('3/5 filled');

		// Only DPS is still recruitable.
		const disabled = Object.fromEntries(body.data.components[0].components.map((b: any) => [b.custom_id.split(':')[2], b.disabled]));
		expect(disabled).toMatchObject({ tank: true, healer: true, dps: false });

		const stored = await env.DB.prepare('SELECT * FROM mplus_groups').first<GroupRow>();
		expect(stored).toMatchObject({ tank_reserved: 0, healer_reserved: 1, dps_reserved: 1, status: 'OPEN' });
	});

	it('rejects an LF phrase that overflows the composition', async () => {
		const { body } = await post(modalInteraction('creator', { ...fields, role: 'tank', comp: 'lf 2 tanks' }));
		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('only has 1 Tank slot');
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_groups').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('rejects an unreadable role without writing anything', async () => {
		const { body } = await post(modalInteraction('creator', { ...fields, role: 'whatever' }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('Tank');
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_groups').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('reads a start time with no zone in the server timezone', async () => {
		await configureGuild(env.DB, { timezone: 'America/Chicago' });
		fetchMock.get('https://discord.com').intercept({ method: 'GET', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		await post(modalInteraction('creator', { ...fields, start_time: '8pm' }));

		const row = await env.DB.prepare('SELECT start_ts FROM mplus_groups').first<{ start_ts: number }>();
		const inChicago = new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/Chicago',
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(row!.start_ts * 1000));
		expect(inChicago).toBe('8:00 PM');
	});

	it('lets a named zone in the start time override the server timezone', async () => {
		await configureGuild(env.DB, { timezone: 'America/Chicago' });
		fetchMock.get('https://discord.com').intercept({ method: 'GET', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		await post(modalInteraction('creator', { ...fields, start_time: '8pm EST' }));

		const row = await env.DB.prepare('SELECT start_ts FROM mplus_groups').first<{ start_ts: number }>();
		const inNewYork = new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(row!.start_ts * 1000));
		expect(inNewYork).toBe('8:00 PM');
	});

	it('rejects a composition that cannot fit a party', async () => {
		const { body } = await post(modalInteraction('creator', { ...fields, comp: '2/2/3' }));
		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('1–5 players');
	});

	it('does not post when settings changed after the modal was opened', async () => {
		await setGuildConfig(env.DB, { guildId: GUILD_ID, channelId: OTHER_CHANNEL_ID, timezone: TIMEZONE });

		const { body } = await post(modalInteraction('creator', fields));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(`<#${OTHER_CHANNEL_ID}>`);
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_groups').first<{ n: number }>()).toEqual({ n: 0 });
	});
});

describe('roster buttons', () => {
	it('updates the shared message in place when someone joins', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		const { body } = await post(buttonInteraction('healer', joinId('HEALER', group.id)));

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		const fields = Object.fromEntries(body.data.embeds[0].fields.map((field: any) => [field.name, field.value]));
		expect(fields['💚 Healer 1/1']).toBe('<@healer>');

		const state = await loadState(env.DB, group.id);
		expect(state?.signups.map((signup) => signup.user_id).sort()).toEqual(['creator', 'healer']);
	});

	it('explains privately when a role has already been taken, and refreshes the stale message', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		const { body } = await post(buttonInteraction('latecomer', joinId('TANK', group.id)));

		expect(body.type).toBe(InteractionResponseType.ChannelMessageWithSource);
		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('Tank slots are already taken');
	});

	it('refuses a cancel from someone who is neither the leader nor a moderator', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, { id: 'message-1' });

		const { body } = await post(buttonInteraction('randomer', `mplus:cancel:${group.id}`));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('Only the run leader');
		expect((await loadState(env.DB, group.id))?.group.status).toBe('OPEN');
	});

	it('lets a moderator cancel and greys out every button', async () => {
		const { group } = await seedGroup(env.DB, { creatorId: 'creator' });
		const { body } = await post(buttonInteraction('officer', `mplus:cancel:${group.id}`, 'moderator'));

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		expect(body.data.components[0].components.every((button: any) => button.disabled)).toBe(true);
		expect((await loadState(env.DB, group.id))?.group.status).toBe('CANCELLED');
	});

	it('ignores a custom_id it does not own', async () => {
		const { body } = await post(buttonInteraction('someone', 'someotherbot:click:1'));
		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('no longer supported');
	});

	it('rejects buttons on old posts after the configured channel changes', async () => {
		const { group } = await seedGroup(env.DB, { creatorRole: 'TANK' });
		await setGuildConfig(env.DB, { guildId: GUILD_ID, channelId: OTHER_CHANNEL_ID, timezone: TIMEZONE });

		const { body } = await post(buttonInteraction('healer', joinId('HEALER', group.id)));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(`<#${OTHER_CHANNEL_ID}>`);
		expect((await loadState(env.DB, group.id))?.signups).toHaveLength(1);
	});
});

describe('scheduled sweep', () => {
	it('expires stale runs and rewrites their messages', async () => {
		const staleAt = Math.floor(Date.now() / 1000) - 4 * 3600;
		const { group } = await seedGroup(env.DB, { startTs: staleAt, createdAt: staleAt });
		await env.DB.prepare('UPDATE mplus_groups SET message_id = ?2 WHERE id = ?1').bind(group.id, 'message-1').run();

		fetchMock
			.get('https://discord.com')
			.intercept({ method: 'PATCH', path: `/api/v10/channels/${CHANNEL_ID}/messages/message-1` })
			.reply(200, {});

		expect(await sweepExpiredGroups(env)).toBe(1);
		expect((await loadState(env.DB, group.id))?.group.status).toBe('EXPIRED');
	});

	it('does nothing when there is nothing stale', async () => {
		await seedGroup(env.DB);
		expect(await sweepExpiredGroups(env)).toBe(0);
	});
});

describe('retention purge', () => {
	const RETENTION = 24 * 3600;

	it('deletes runs whose retention window has elapsed, roster included', async () => {
		const longGone = Math.floor(Date.now() / 1000) - RETENTION - 3600;
		const { group } = await seedGroup(env.DB, { startTs: longGone, createdAt: longGone });

		expect(await purgeOldRuns(env)).toBe(1);
		expect(await loadState(env.DB, group.id)).toBeNull();
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mplus_signups').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('leaves a run alone that has only just expired', async () => {
		const justStarted = Math.floor(Date.now() / 1000) - 2 * 3600;
		await seedGroup(env.DB, { startTs: justStarted, createdAt: justStarted });

		expect(await purgeOldRuns(env)).toBe(0);
	});

	it('tells anyone clicking a purged run that it is gone', async () => {
		const longGone = Math.floor(Date.now() / 1000) - RETENTION - 3600;
		const { group } = await seedGroup(env.DB, { startTs: longGone, createdAt: longGone });
		await purgeOldRuns(env);

		const { body } = await post(buttonInteraction('healer', joinId('HEALER', group.id)));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('no longer tracked');
	});
});
