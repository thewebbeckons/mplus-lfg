import { createExecutionContext, env, fetchMock, waitOnExecutionContext } from 'cloudflare:test';
import { InteractionResponseType, MessageFlags } from 'discord-api-types/v10';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { craftButtonId } from '../src/craft/customId';
import { loadCraftRequest } from '../src/craft/db';
import { resetItemMetadataCache } from '../src/craft/itemMetadata';
import worker, { purgeOldCraftRequests, sweepExpiredCraftRequests } from '../src/index';
import {
	CHANNEL_ID,
	CRAFTER_ROLE_ID,
	CRAFT_CHANNEL_ID,
	CRAFT_ITEM_URL,
	GUILD_ID,
	OTHER_CHANNEL_ID,
	applySchema,
	buttonInteraction,
	commandInteraction,
	configureCraftingGuild,
	configureGuild,
	craftModalInteraction,
	createSigningKey,
	seedCraftRequest,
	setupModalInteraction,
	signedInteraction,
} from './helpers';
import type { SigningKey } from './helpers';

const APP_ID = '000000000000000001';
const FOLLOWUP_PATH = `/api/v10/webhooks/${APP_ID}/interaction-token`;
const ORIGINAL_MESSAGE_PATH = `${FOLLOWUP_PATH}/messages/@original`;
const DM_CHANNEL_PATH = '/api/v10/users/@me/channels';

let key: SigningKey;

beforeAll(async () => {
	key = await createSigningKey();
	env.DISCORD_PUBLIC_KEY = key.publicKeyHex;
	fetchMock.activate();
	fetchMock.disableNetConnect();
});

beforeEach(async () => {
	await applySchema(env.DB, env.SCHEMA_SQL);
	await configureCraftingGuild(env.DB);
	resetItemMetadataCache();
	// No Blizzard credentials by default: the fallback path is what most servers
	// will actually run, so it is the default under test.
	env.BLIZZARD_CLIENT_ID = undefined;
	env.BLIZZARD_CLIENT_SECRET = undefined;
});

afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
});

async function post(payload: unknown): Promise<{ response: Response; body: any }> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(await signedInteraction(key, payload), env, ctx);
	await waitOnExecutionContext(ctx);
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

/** The two calls a successful `/craft` submission makes after deferring. */
function expectPublishCalls(messageId = 'craft-message-1') {
	fetchMock
		.get('https://discord.com')
		.intercept({ method: 'POST', path: FOLLOWUP_PATH })
		.reply(200, { id: messageId, channel_id: CRAFT_CHANNEL_ID });
	fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});
}

const FIELDS = {
	craft_item_url: CRAFT_ITEM_URL,
	craft_quantity: '2',
	craft_character: 'Ashwynn — Area 52',
	craft_details: 'Rank 3 if possible, I have the mats',
};

async function onlyRequest() {
	const row = await env.DB.prepare('SELECT id FROM craft_requests').first<{ id: string }>();
	return row ? loadCraftRequest(env.DB, row.id) : null;
}

describe('/craft gating', () => {
	it('opens the request modal inside the crafting channel', async () => {
		const { body } = await post(commandInteraction('asker', { name: 'craft', channelId: CRAFT_CHANNEL_ID }));

		expect(body.type).toBe(InteractionResponseType.Modal);
		expect(body.data.custom_id).toBe('mplus:craft:create');
		expect(body.data.components.map((label: any) => label.component.custom_id)).toEqual([
			'craft_item_url',
			'craft_quantity',
			'craft_character',
			'craft_details',
		]);
		// Only the item link is required.
		expect(body.data.components.map((label: any) => label.component.required)).toEqual([true, false, false, false]);
	});

	it('points an admin at setup when crafting was never configured', async () => {
		await configureGuild(env.DB);

		const { body } = await post(commandInteraction('asker', { name: 'craft', channelId: CRAFT_CHANNEL_ID }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('`/setup`');
		expect(body.data.content).toContain('crafting channel');
	});

	it('says the same thing when the server has no configuration at all', async () => {
		await env.DB.prepare('DELETE FROM mplus_guild_config WHERE guild_id = ?1').bind(GUILD_ID).run();

		const { body } = await post(commandInteraction('asker', { name: 'craft', channelId: CRAFT_CHANNEL_ID }));
		expect(body.data.content).toContain('`/setup`');
	});

	it('redirects /craft used outside the crafting channel', async () => {
		const { body } = await post(commandInteraction('asker', { name: 'craft', channelId: CHANNEL_ID }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(`<#${CRAFT_CHANNEL_ID}>`);
	});

	it('keeps /lfg working in the LFG channel with crafting configured', async () => {
		const { body } = await post(commandInteraction('leader', { channelId: CHANNEL_ID }));
		expect(body.type).toBe(InteractionResponseType.Modal);
		expect(body.data.custom_id).toBe('mplus:create');
	});
});

describe('/craft submission', () => {
	it('defers, then posts the request publicly and records it', async () => {
		expectPublishCalls();

		const { body } = await post(craftModalInteraction('asker', FIELDS));

		// Deferred privately, so the requester never sees a public spinner.
		expect(body.type).toBe(InteractionResponseType.DeferredChannelMessageWithSource);
		expect(body.data.flags).toBe(MessageFlags.Ephemeral);

		const stored = await onlyRequest();
		expect(stored).toMatchObject({
			guild_id: GUILD_ID,
			channel_id: CRAFT_CHANNEL_ID,
			requester_id: 'asker',
			item_id: 222441,
			item_url: CRAFT_ITEM_URL,
			quantity: 2,
			character_realm: 'Ashwynn — Area 52',
			details: 'Rank 3 if possible, I have the mats',
			status: 'OPEN',
			message_id: 'craft-message-1',
		});
	});

	it('falls back to the URL slug for the item name with no Blizzard credentials', async () => {
		expectPublishCalls();
		await post(craftModalInteraction('asker', FIELDS));

		expect((await onlyRequest())?.item_name).toBe('Charged Claw');
		expect((await onlyRequest())?.item_icon).toBeNull();
	});

	it('falls back to the item id when the link carries no slug', async () => {
		expectPublishCalls();
		await post(craftModalInteraction('asker', { ...FIELDS, craft_item_url: 'https://www.wowhead.com/item=222441' }));

		expect((await onlyRequest())?.item_name).toBe('WoW Item #222441');
	});

	it('defaults the quantity to 1 when the field is left blank', async () => {
		expectPublishCalls();
		await post(craftModalInteraction('asker', { ...FIELDS, craft_quantity: '' }));

		expect((await onlyRequest())?.quantity).toBe(1);
	});

	it('rejects a bad link immediately, without deferring or writing anything', async () => {
		const { body } = await post(craftModalInteraction('asker', { ...FIELDS, craft_item_url: 'https://evil.test/item=1' }));

		expect(body.type).toBe(InteractionResponseType.ChannelMessageWithSource);
		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('wowhead.com');
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM craft_requests').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('rejects a Classic link with an explanation', async () => {
		const { body } = await post(
			craftModalInteraction('asker', { ...FIELDS, craft_item_url: 'https://www.wowhead.com/classic/item=19019' }),
		);
		expect(body.data.content).toContain('Classic');
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM craft_requests').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('rejects an unreadable quantity without writing anything', async () => {
		const { body } = await post(craftModalInteraction('asker', { ...FIELDS, craft_quantity: 'lots' }));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('whole number');
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM craft_requests').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('rejects a submission from outside the crafting channel', async () => {
		const { body } = await post(craftModalInteraction('asker', FIELDS, CHANNEL_ID));

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(`<#${CRAFT_CHANNEL_ID}>`);
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM craft_requests').first<{ n: number }>()).toEqual({ n: 0 });
	});

	it('leaves nothing behind, and explains, when the public post fails', async () => {
		fetchMock.get('https://discord.com').intercept({ method: 'POST', path: FOLLOWUP_PATH }).reply(403, 'no');
		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});

		const { body } = await post(craftModalInteraction('asker', FIELDS));

		expect(body.type).toBe(InteractionResponseType.DeferredChannelMessageWithSource);
		// The deferred response is always resolved, so nobody is left loading.
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM craft_requests').first<{ n: number }>()).toEqual({ n: 0 });
	});
});

describe('item metadata', () => {
	it('uses the Blizzard name, quality, and icon when credentials are configured', async () => {
		env.BLIZZARD_CLIENT_ID = 'client';
		env.BLIZZARD_CLIENT_SECRET = 'secret';

		fetchMock
			.get('https://oauth.battle.net')
			.intercept({ method: 'POST', path: '/token' })
			.reply(200, { access_token: 'token-1', expires_in: 86400 });
		fetchMock
			.get('https://us.api.blizzard.com')
			.intercept({ method: 'GET', path: '/data/wow/item/222441?namespace=static-us&locale=en_US' })
			.reply(200, { id: 222441, name: 'Charged Claymore', quality: { type: 'EPIC', name: 'Epic' } });
		fetchMock
			.get('https://us.api.blizzard.com')
			.intercept({ method: 'GET', path: '/data/wow/media/item/222441?namespace=static-us' })
			.reply(200, {
				assets: [{ key: 'icon', value: 'https://render.worldofwarcraft.com/us/icons/56/inv_sword_39.jpg' }],
			});
		expectPublishCalls();

		await post(craftModalInteraction('asker', FIELDS));

		expect(await onlyRequest()).toMatchObject({
			item_name: 'Charged Claymore',
			item_quality: 'EPIC',
			item_icon: 'https://render.worldofwarcraft.com/us/icons/56/inv_sword_39.jpg',
		});
	});

	it('still creates the request when the Blizzard lookup fails', async () => {
		env.BLIZZARD_CLIENT_ID = 'client';
		env.BLIZZARD_CLIENT_SECRET = 'secret';

		fetchMock.get('https://oauth.battle.net').intercept({ method: 'POST', path: '/token' }).reply(503, 'unavailable');
		expectPublishCalls();

		await post(craftModalInteraction('asker', FIELDS));

		expect(await onlyRequest()).toMatchObject({ item_name: 'Charged Claw', item_icon: null, status: 'OPEN' });
	});

	it('refuses an icon URL that is not on a Blizzard host', async () => {
		env.BLIZZARD_CLIENT_ID = 'client';
		env.BLIZZARD_CLIENT_SECRET = 'secret';

		fetchMock
			.get('https://oauth.battle.net')
			.intercept({ method: 'POST', path: '/token' })
			.reply(200, { access_token: 'token-2', expires_in: 86400 });
		fetchMock
			.get('https://us.api.blizzard.com')
			.intercept({ method: 'GET', path: '/data/wow/item/222441?namespace=static-us&locale=en_US' })
			.reply(200, { id: 222441, name: 'Charged Claymore' });
		fetchMock
			.get('https://us.api.blizzard.com')
			.intercept({ method: 'GET', path: '/data/wow/media/item/222441?namespace=static-us' })
			.reply(200, { assets: [{ key: 'icon', value: 'https://evil.test/pwn.jpg' }] });
		expectPublishCalls();

		await post(craftModalInteraction('asker', FIELDS));

		expect(await onlyRequest()).toMatchObject({ item_name: 'Charged Claymore', item_icon: null });
	});
});

describe('crafting buttons', () => {
	it('claims an open request and rewrites the public message', async () => {
		const seeded = await seedCraftRequest(env.DB);

		const { body } = await post(
			buttonInteraction('smith', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		expect(body.data.embeds[0].description).toContain('**Crafter** <@smith>');
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('CLAIMED');
	});

	it('tells the loser of a claim race, and refreshes what they were looking at', async () => {
		const seeded = await seedCraftRequest(env.DB);
		await post(buttonInteraction('smith', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }));

		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});
		const { body } = await post(
			buttonInteraction('other', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('claimed this request first');
		expect((await loadCraftRequest(env.DB, seeded.id))?.crafter_id).toBe('smith');
	});

	it('releases a claim back to the pool', async () => {
		const seeded = await seedCraftRequest(env.DB);
		await post(buttonInteraction('smith', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }));

		const { body } = await post(
			buttonInteraction('smith', craftButtonId('release', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('OPEN');
	});

	it('refuses a release from someone who is not the crafter', async () => {
		const seeded = await seedCraftRequest(env.DB);
		await post(buttonInteraction('smith', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }));

		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});
		const { body } = await post(
			buttonInteraction('meddler', craftButtonId('release', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.content).toContain('Only the crafter');
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('CLAIMED');
	});

	it('lets the requester cancel and drops the mutation buttons', async () => {
		const seeded = await seedCraftRequest(env.DB, { requesterId: 'asker' });

		const { body } = await post(
			buttonInteraction('asker', craftButtonId('cancel', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		const remaining = body.data.components[0].components;
		expect(remaining.every((button: any) => button.custom_id === undefined)).toBe(true);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('CANCELLED');
	});

	it('refuses a cancel from an unrelated member', async () => {
		const seeded = await seedCraftRequest(env.DB, { requesterId: 'asker' });

		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});
		const { body } = await post(
			buttonInteraction('randomer', craftButtonId('cancel', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.content).toContain('Only the requester');
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('OPEN');
	});

	it("lets a moderator cancel someone else's request", async () => {
		const seeded = await seedCraftRequest(env.DB, { requesterId: 'asker' });

		const { body } = await post(
			buttonInteraction('officer', craftButtonId('cancel', seeded.id), {
				permissions: 'moderator',
				channelId: CRAFT_CHANNEL_ID,
			}),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('CANCELLED');
	});

	it('tells a clicker their request has been cleaned up', async () => {
		const { body } = await post(
			buttonInteraction('smith', craftButtonId('claim', 'long-gone'), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain('no longer tracked');
	});

	it('rejects crafting buttons on posts in a channel that is no longer configured', async () => {
		const seeded = await seedCraftRequest(env.DB);
		await configureCraftingGuild(env.DB, { craftChannelId: OTHER_CHANNEL_ID });

		const { body } = await post(
			buttonInteraction('smith', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.content).toContain(`<#${OTHER_CHANNEL_ID}>`);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('OPEN');
	});

	it('does not read an LFG button as a crafting one', async () => {
		const { body } = await post(buttonInteraction('someone', 'mplus:craft:nonsense', { channelId: CRAFT_CHANNEL_ID }));
		expect(body.data.content).toContain('no longer supported');
	});
});

describe('crafter role restriction', () => {
	beforeEach(async () => {
		await configureCraftingGuild(env.DB, { crafterRoleId: CRAFTER_ROLE_ID });
	});

	it('lets a member with the crafter role claim', async () => {
		const seeded = await seedCraftRequest(env.DB);

		const { body } = await post(
			buttonInteraction('smith', craftButtonId('claim', seeded.id), {
				roles: [CRAFTER_ROLE_ID],
				channelId: CRAFT_CHANNEL_ID,
			}),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('CLAIMED');
	});

	it('refuses a member without the crafter role', async () => {
		const seeded = await seedCraftRequest(env.DB);

		const { body } = await post(
			buttonInteraction('nobody', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(`<@&${CRAFTER_ROLE_ID}>`);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('OPEN');
	});

	it('still lets a moderator claim without holding the role', async () => {
		const seeded = await seedCraftRequest(env.DB);

		const { body } = await post(
			buttonInteraction('officer', craftButtonId('claim', seeded.id), {
				permissions: 'moderator',
				channelId: CRAFT_CHANNEL_ID,
			}),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
	});

	it('lets anyone claim once no crafter role is configured', async () => {
		await configureCraftingGuild(env.DB);
		const seeded = await seedCraftRequest(env.DB);

		const { body } = await post(
			buttonInteraction('nobody', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
	});
});

describe('completion notification', () => {
	async function claimed(messageId = 'craft-message-1') {
		const seeded = await seedCraftRequest(env.DB, { requesterId: 'asker', messageId, quantity: 2 });
		await post(buttonInteraction('smith', craftButtonId('claim', seeded.id), { channelId: CRAFT_CHANNEL_ID }));
		return seeded;
	}

	function expectDm(dmChannelId = 'dm-1') {
		fetchMock
			.get('https://discord.com')
			.intercept({ method: 'POST', path: DM_CHANNEL_PATH })
			.reply(200, { id: dmChannelId });
		fetchMock
			.get('https://discord.com')
			.intercept({ method: 'POST', path: `/api/v10/channels/${dmChannelId}/messages` })
			.reply(200, { id: 'dm-message-1' });
	}

	it('completes the request, updates the embed, and DMs the requester', async () => {
		const seeded = await claimed();
		expectDm();

		const { body } = await post(
			buttonInteraction('smith', craftButtonId('complete', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.type).toBe(InteractionResponseType.UpdateMessage);
		expect(body.data.embeds[0].title).toContain('✅');
		expect(body.data.components[0].components.every((button: any) => button.custom_id === undefined)).toBe(true);

		expect(await loadCraftRequest(env.DB, seeded.id)).toMatchObject({
			status: 'COMPLETED',
			notify_status: 'DM_SENT',
		});
	});

	it('never DMs twice, however many times complete is clicked', async () => {
		const seeded = await claimed();
		expectDm();

		await post(buttonInteraction('smith', craftButtonId('complete', seeded.id), { channelId: CRAFT_CHANNEL_ID }));

		// No further DM interceptors: a second DM would fail `disableNetConnect`.
		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});
		const { body } = await post(
			buttonInteraction('smith', craftButtonId('complete', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.content).toContain('already marked complete');
		expect((await loadCraftRequest(env.DB, seeded.id))?.notify_status).toBe('DM_SENT');
	});

	it('falls back to a channel mention when the requester will not accept DMs', async () => {
		const seeded = await claimed();
		fetchMock.get('https://discord.com').intercept({ method: 'POST', path: DM_CHANNEL_PATH }).reply(403, 'no DMs');
		fetchMock
			.get('https://discord.com')
			.intercept({ method: 'POST', path: `/api/v10/channels/${CRAFT_CHANNEL_ID}/messages` })
			.reply(200, { id: 'fallback-1' });

		await post(buttonInteraction('smith', craftButtonId('complete', seeded.id), { channelId: CRAFT_CHANNEL_ID }));

		expect((await loadCraftRequest(env.DB, seeded.id))?.notify_status).toBe('FALLBACK_POSTED');
	});

	it('records a failure when the DM and the fallback both fail', async () => {
		const seeded = await claimed();
		fetchMock.get('https://discord.com').intercept({ method: 'POST', path: DM_CHANNEL_PATH }).reply(403, 'no DMs');
		fetchMock
			.get('https://discord.com')
			.intercept({ method: 'POST', path: `/api/v10/channels/${CRAFT_CHANNEL_ID}/messages` })
			.reply(403, 'no permission');

		await post(buttonInteraction('smith', craftButtonId('complete', seeded.id), { channelId: CRAFT_CHANNEL_ID }));

		// Recorded either way, so a repeat click still cannot start over.
		expect((await loadCraftRequest(env.DB, seeded.id))?.notify_status).toBe('DM_FAILED');
	});

	it('sends nothing at all when a non-crafter clicks complete', async () => {
		const seeded = await claimed();

		fetchMock.get('https://discord.com').intercept({ method: 'PATCH', path: ORIGINAL_MESSAGE_PATH }).reply(200, {});
		const { body } = await post(
			buttonInteraction('meddler', craftButtonId('complete', seeded.id), { channelId: CRAFT_CHANNEL_ID }),
		);

		expect(body.data.content).toContain('Only the crafter');
		expect((await loadCraftRequest(env.DB, seeded.id))?.notify_status).toBeNull();
	});
});

describe('crafting maintenance', () => {
	it('expires old requests and rewrites their messages', async () => {
		const longAgo = Math.floor(Date.now() / 1000) - 20 * 24 * 3600;
		const seeded = await seedCraftRequest(env.DB, { createdAt: longAgo, messageId: 'craft-message-1' });

		fetchMock
			.get('https://discord.com')
			.intercept({ method: 'PATCH', path: `/api/v10/channels/${CRAFT_CHANNEL_ID}/messages/craft-message-1` })
			.reply(200, {});

		expect(await sweepExpiredCraftRequests(env)).toBe(1);
		expect((await loadCraftRequest(env.DB, seeded.id))?.status).toBe('EXPIRED');
	});

	it('does nothing when nothing is stale', async () => {
		await seedCraftRequest(env.DB);
		expect(await sweepExpiredCraftRequests(env)).toBe(0);
	});

	it('purges requests past the retention window', async () => {
		const longGone = Math.floor(Date.now() / 1000) - 40 * 24 * 3600;
		const seeded = await seedCraftRequest(env.DB, { createdAt: longGone });

		expect(await purgeOldCraftRequests(env)).toBe(1);
		expect(await loadCraftRequest(env.DB, seeded.id)).toBeNull();
	});

	it('leaves a recent request in place', async () => {
		await seedCraftRequest(env.DB);
		expect(await purgeOldCraftRequests(env)).toBe(0);
	});
});

describe('/setup with crafting', () => {
	it('saves a crafting channel and a crafter role', async () => {
		const { body } = await post(
			setupModalInteraction('admin', CHANNEL_ID, {
				permissions: 'manageGuild',
				craftChannelId: CRAFT_CHANNEL_ID,
				crafterRoleId: CRAFTER_ROLE_ID,
			}),
		);

		expect(body.data.flags).toBe(MessageFlags.Ephemeral);
		expect(body.data.content).toContain(`<#${CRAFT_CHANNEL_ID}>`);
		expect(body.data.content).toContain(`<@&${CRAFTER_ROLE_ID}>`);
		// The confirmation must not ping the role it names.
		expect(body.data.allowed_mentions).toEqual({ parse: [] });
	});

	it('leaves crafting alone when the pickers are not part of the submission', async () => {
		await configureCraftingGuild(env.DB, { crafterRoleId: CRAFTER_ROLE_ID });

		await post(setupModalInteraction('admin', OTHER_CHANNEL_ID, { permissions: 'manageGuild', timezone: null }));

		const config = await env.DB.prepare('SELECT * FROM mplus_guild_config WHERE guild_id = ?1').bind(GUILD_ID).first();
		expect(config).toMatchObject({ craft_channel_id: CRAFT_CHANNEL_ID, crafter_role_id: CRAFTER_ROLE_ID });
	});

	it('turns crafting back off when the picker is submitted empty', async () => {
		await configureCraftingGuild(env.DB, { crafterRoleId: CRAFTER_ROLE_ID });

		const { body } = await post(
			setupModalInteraction('admin', CHANNEL_ID, {
				permissions: 'manageGuild',
				craftChannelId: null,
				crafterRoleId: null,
			}),
		);

		expect(body.data.content).toContain('Crafting is off');
		const config = await env.DB.prepare('SELECT * FROM mplus_guild_config WHERE guild_id = ?1').bind(GUILD_ID).first();
		expect(config).toMatchObject({ craft_channel_id: null, crafter_role_id: null });
	});

	it('refuses to point LFG and crafting at the same channel', async () => {
		const { body } = await post(
			setupModalInteraction('admin', CHANNEL_ID, { permissions: 'manageGuild', craftChannelId: CHANNEL_ID }),
		);

		expect(body.data.content).toContain('different channel');
	});

	it('refuses a crafting channel that is not a text channel', async () => {
		const { body } = await post(
			setupModalInteraction('admin', CHANNEL_ID, {
				permissions: 'manageGuild',
				craftChannelId: CRAFT_CHANNEL_ID,
				craftChannelType: 2,
			}),
		);

		expect(body.data.content).toContain('text channel for crafting');
	});
});
