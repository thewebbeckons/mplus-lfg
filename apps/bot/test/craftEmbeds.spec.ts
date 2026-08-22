import { ButtonStyle, ComponentType } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { CRAFT_STATUS_META, QUALITY_COLOR } from '../src/craft/constants';
import { buildCraftComponents, buildCraftEmbed, buildCraftMessage, craftJumpLink } from '../src/craft/embeds';
import type { CraftRequestRow, CraftStatus } from '../src/craft/types';

const ITEM_URL = 'https://www.wowhead.com/item=222441/charged-claw?bonus=10421:9633';

function request(overrides: Partial<CraftRequestRow> = {}): CraftRequestRow {
	return {
		id: 'abcdef12-3456-7890-abcd-ef1234567890',
		guild_id: 'guild-1',
		channel_id: 'channel-1',
		message_id: 'message-1',
		requester_id: 'asker',
		requester_name: 'Asker',
		item_id: 222441,
		item_url: ITEM_URL,
		item_name: 'Charged Claw',
		item_icon: null,
		item_quality: null,
		quantity: 1,
		character_realm: null,
		details: null,
		status: 'OPEN',
		crafter_id: null,
		crafter_name: null,
		created_at: 1_750_000_000,
		claimed_at: null,
		completed_at: null,
		notified_at: null,
		notify_status: null,
		...overrides,
	};
}

/** Custom ids keyed by their action segment; link buttons have none. */
function buttons(row: CraftRequestRow) {
	const rowComponents = buildCraftComponents(row)[0];
	expect(rowComponents.type).toBe(ComponentType.ActionRow);
	return rowComponents.components;
}

function actions(row: CraftRequestRow): string[] {
	return buttons(row)
		.filter((button) => 'custom_id' in button)
		.map((button) => (button as { custom_id: string }).custom_id.split(':')[2]);
}

const EVERY_STATUS: CraftStatus[] = ['OPEN', 'CLAIMED', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

describe('buildCraftEmbed', () => {
	it('leads with the item name and status', () => {
		const embed = buildCraftEmbed(request());
		expect(embed.title).toBe(`${CRAFT_STATUS_META.OPEN.emoji} Charged Claw`);
		expect(embed.description).toContain('**Requested by** <@asker>');
		expect(embed.description).toContain(CRAFT_STATUS_META.OPEN.label);
	});

	it('shows the quantity in the title once there is more than one', () => {
		expect(buildCraftEmbed(request({ quantity: 5 })).title).toContain('Charged Claw ×5');
		expect(buildCraftEmbed(request({ quantity: 1 })).title).not.toContain('×');
	});

	it('always states the quantity as a field', () => {
		const embed = buildCraftEmbed(request({ quantity: 3 }));
		expect(embed.fields).toContainEqual({ name: 'Quantity', value: '×3', inline: true });
	});

	it('falls back to the item id when no name was ever resolved', () => {
		expect(buildCraftEmbed(request({ item_name: null })).title).toContain('WoW Item #222441');
	});

	it('shows the character and realm only when supplied', () => {
		const named = buildCraftEmbed(request({ character_realm: 'Ashwynn — Area 52' }));
		expect(named.fields?.map((field) => field.name)).toContain('Character');

		const anonymous = buildCraftEmbed(request());
		expect(anonymous.fields?.map((field) => field.name)).not.toContain('Character');
	});

	it('shows request details only when supplied', () => {
		const detailed = buildCraftEmbed(request({ details: 'Rank 3 please, I have the mats' }));
		expect(detailed.fields?.find((field) => field.name === 'Request details')?.value).toContain('Rank 3 please');
		expect(buildCraftEmbed(request()).fields?.map((field) => field.name)).not.toContain('Request details');
	});

	it('names the crafter once the request is claimed', () => {
		const claimed = buildCraftEmbed(request({ status: 'CLAIMED', crafter_id: 'smith', crafter_name: 'Smithy' }));
		expect(claimed.description).toContain('**Crafter** <@smith>');
		expect(buildCraftEmbed(request()).description).not.toContain('**Crafter**');
	});

	it('reports when a completed request was finished', () => {
		const done = buildCraftEmbed(
			request({ status: 'COMPLETED', crafter_id: 'smith', completed_at: 1_750_000_600 }),
		);
		expect(done.description).toContain('<t:1750000600:R>');
	});

	it('carries the item icon as a thumbnail when one was resolved', () => {
		const icon = 'https://render.worldofwarcraft.com/us/icons/56/inv_sword_39.jpg';
		expect(buildCraftEmbed(request({ item_icon: icon })).thumbnail).toEqual({ url: icon });
		expect(buildCraftEmbed(request()).thumbnail).toBeUndefined();
	});

	it('tints an open request by item quality, and a closed one by status', () => {
		expect(buildCraftEmbed(request({ item_quality: 'EPIC' })).color).toBe(QUALITY_COLOR.EPIC);
		expect(buildCraftEmbed(request({ item_quality: 'EPIC', status: 'COMPLETED' })).color).toBe(
			CRAFT_STATUS_META.COMPLETED.color,
		);
	});

	it('carries a stable short request identifier in the footer', () => {
		expect(buildCraftEmbed(request()).footer?.text).toBe('Request abcdef12');
	});

	it('neutralises markdown and mention syntax in text the requester typed', () => {
		const embed = buildCraftEmbed(request({ details: '# @everyone [click](https://evil.test)' }));
		const value = embed.fields?.find((field) => field.name === 'Request details')?.value ?? '';
		expect(value).not.toContain('@everyone');
		expect(value).toContain('\\#');
	});

	it('renders a distinct title and colour for every status', () => {
		for (const status of EVERY_STATUS) {
			const embed = buildCraftEmbed(request({ status }));
			expect(embed.title).toContain(CRAFT_STATUS_META[status].emoji);
			expect(embed.color).toBe(CRAFT_STATUS_META[status].color);
		}
	});
});

describe('buildCraftComponents', () => {
	it('offers claim and cancel while the request is open', () => {
		expect(actions(request())).toEqual(['claim', 'cancel']);
	});

	it('offers complete, release, and cancel once claimed', () => {
		expect(actions(request({ status: 'CLAIMED', crafter_id: 'smith' }))).toEqual(['complete', 'release', 'cancel']);
	});

	it('retains no mutation buttons on a finished request', () => {
		for (const status of ['COMPLETED', 'CANCELLED', 'EXPIRED'] as const) {
			expect(actions(request({ status }))).toEqual([]);
		}
	});

	it('always keeps the Wowhead link, pointed at the exact submitted URL', () => {
		for (const status of EVERY_STATUS) {
			const link = buttons(request({ status })).find((button) => button.style === ButtonStyle.Link);
			expect(link).toMatchObject({ style: ButtonStyle.Link, label: 'View on Wowhead', url: ITEM_URL });
		}
	});

	it('namespaces every custom id under crafting', () => {
		for (const status of EVERY_STATUS) {
			for (const button of buttons(request({ status }))) {
				if ('custom_id' in button) expect(button.custom_id).toMatch(/^mplus:craft:/);
			}
		}
	});

	it('keeps every custom id inside Discord\'s 100 character limit', () => {
		for (const button of buttons(request({ status: 'CLAIMED' }))) {
			if ('custom_id' in button) expect(button.custom_id.length).toBeLessThanOrEqual(100);
		}
	});
});

describe('buildCraftMessage', () => {
	it('never lets a mention in the embed become a ping', () => {
		expect(buildCraftMessage(request()).allowed_mentions).toEqual({ parse: [] });
	});
});

describe('craftJumpLink', () => {
	it('builds a jump link once the message id is known', () => {
		expect(craftJumpLink(request())).toBe('https://discord.com/channels/guild-1/channel-1/message-1');
	});

	it('has no link when the post never landed', () => {
		expect(craftJumpLink(request({ message_id: null }))).toBeNull();
	});
});
