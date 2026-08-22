import { ComponentType } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { buildComponents, buildEmbed, rosterCounts } from '../src/lfg/embeds';
import type { GroupRow, GroupState, Role, SignupRow } from '../src/lfg/types';

function state(overrides: Partial<GroupRow> = {}, roster: Array<[string, Role]> = []): GroupState {
	const group: GroupRow = {
		id: 'abcdef12-3456-7890-abcd-ef1234567890',
		guild_id: 'g',
		channel_id: 'c',
		message_id: null,
		creator_id: 'creator',
		activity: '+10 Weekly Vault',
		start_time: 'in 30 mins',
		start_ts: 1750000000,
		notes: null,
		tank_needed: 1,
		healer_needed: 1,
		dps_needed: 3,
		tank_reserved: 0,
		healer_reserved: 0,
		dps_reserved: 0,
		status: 'OPEN',
		created_at: 1749999000,
		...overrides,
	};
	const signups: SignupRow[] = roster.map(([userId, role], index) => ({
		id: index + 1,
		group_id: group.id,
		user_id: userId,
		username: userId,
		role,
		signed_at: 1749999000 + index,
	}));
	return { group, signups };
}

function buttons(groupState: GroupState) {
	const row = buildComponents(groupState)[0];
	expect(row.type).toBe(ComponentType.ActionRow);
	return Object.fromEntries(row.components.map((button) => [button.custom_id.split(':').slice(1, -1).join(':'), button]));
}

describe('buildEmbed', () => {
	it('shows filled slots as mentions and the rest as open', () => {
		const embed = buildEmbed(state({}, [['creator', 'TANK']]));
		const fields = Object.fromEntries((embed.fields ?? []).map((field) => [field.name, field.value]));

		expect(fields['🛡️ Tank 1/1']).toBe('<@creator>');
		expect(fields['💚 Healer 0/1']).toBe('`— open —`');
		expect(fields['⚔️ DPS 0/3']).toBe('`— open —`\n`— open —`\n`— open —`');
	});

	it('summarises status and progress in the description', () => {
		const embed = buildEmbed(state({}, [['creator', 'TANK']]));
		expect(embed.description).toContain('**Leader** <@creator>');
		expect(embed.description).toContain('Recruiting · 1/5 filled');
		expect(embed.description).toContain('<t:1750000000:f>');
	});

	it('falls back to the raw start time when it could not be parsed', () => {
		const embed = buildEmbed(state({ start_ts: null, start_time: 'after raid' }));
		expect(embed.description).toContain('**When** after raid');
	});

	it('quotes notes when present and omits the block otherwise', () => {
		expect(buildEmbed(state({ notes: 'Voice required\n640+ ilvl' })).description).toContain('> Voice required\n> 640+ ilvl');
		expect(buildEmbed(state({ notes: null })).description).not.toContain('\n> ');
	});

	it('hides a role entirely when the composition has no slots for it', () => {
		const embed = buildEmbed(state({ tank_needed: 1, healer_needed: 0, dps_needed: 4 }, [['creator', 'TANK']]));
		expect((embed.fields ?? []).map((field) => field.name)).toEqual(['🛡️ Tank 1/1', '⚔️ DPS 0/4']);
	});

	it('shows pre-filled slots as taken but unnamed', () => {
		const embed = buildEmbed(state({ healer_reserved: 1, dps_reserved: 1 }, [['creator', 'TANK']]));
		const fields = Object.fromEntries((embed.fields ?? []).map((field) => [field.name, field.value]));

		expect(fields['💚 Healer 1/1']).toBe('`— premade —`');
		expect(fields['⚔️ DPS 1/3']).toBe('`— premade —`\n`— open —`\n`— open —`');
		expect(embed.description).toContain('Recruiting · 3/5 filled');
	});

	it('lists sign-ups ahead of the pre-filled slots', () => {
		const embed = buildEmbed(state({ dps_reserved: 1 }, [['dps1', 'DPS']]));
		const fields = Object.fromEntries((embed.fields ?? []).map((field) => [field.name, field.value]));
		expect(fields['⚔️ DPS 2/3']).toBe('<@dps1>\n`— premade —`\n`— open —`');
	});

	it('recolours and relabels once the run is cancelled', () => {
		const embed = buildEmbed(state({ status: 'CANCELLED' }));
		expect(embed.title).toContain('❌');
		expect(embed.description).toContain('Cancelled');
	});
});

describe('rosterCounts', () => {
	it('counts filled against total composition slots', () => {
		expect(
			rosterCounts(
				state({}, [
					['creator', 'TANK'],
					['h', 'HEALER'],
				]),
			),
		).toEqual({ filled: 2, total: 5 });
	});
});

describe('buildComponents', () => {
	it('disables only the roles that are already at capacity', () => {
		const row = buttons(state({}, [['creator', 'TANK']]));
		expect(row['join:tank'].disabled).toBe(true);
		expect(row['join:healer'].disabled).toBe(false);
		expect(row['join:dps'].disabled).toBe(false);
		expect(row.leave.disabled).toBe(false);
		expect(row.cancel.disabled).toBe(false);
	});

	it('disables a role whose remaining slots are all pre-filled', () => {
		const row = buttons(state({ healer_reserved: 1, dps_reserved: 1 }, [['creator', 'TANK']]));
		expect(row['join:healer'].disabled).toBe(true);
		expect(row['join:dps'].disabled).toBe(false);
	});

	it('disables every button once the run is no longer live', () => {
		for (const status of ['CANCELLED', 'EXPIRED', 'COMPLETED'] as const) {
			const row = buttons(state({ status }));
			expect(
				Object.values(row).every((button) => button.disabled),
				status,
			).toBe(true);
		}
	});

	it("embeds the group id in every custom_id, within Discord's 100 character limit", () => {
		const groupState = state();
		for (const button of buildComponents(groupState)[0].components) {
			expect(button.custom_id).toContain(groupState.group.id);
			expect(button.custom_id.length).toBeLessThanOrEqual(100);
		}
	});
});
