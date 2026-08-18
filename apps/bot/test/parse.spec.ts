import { describe, expect, it } from 'vitest';
import { parseComposition, parseRole } from '../src/parse';
import type { Role } from '../src/types';

describe('parseRole', () => {
	it('accepts the shorthand people actually type', () => {
		expect(parseRole('Tank')).toBe('TANK');
		expect(parseRole(' t ')).toBe('TANK');
		expect(parseRole('healer')).toBe('HEALER');
		expect(parseRole('heals')).toBe('HEALER');
		expect(parseRole('DPS')).toBe('DPS');
		expect(parseRole('dd')).toBe('DPS');
	});

	it('rejects anything ambiguous', () => {
		expect(parseRole('')).toBeNull();
		expect(parseRole('whatever')).toBeNull();
		expect(parseRole('tank or dps')).toBeNull();
	});
});

const NOTHING_RESERVED = { TANK: 0, HEALER: 0, DPS: 0 };

/** Unwraps a successful parse, failing loudly with the error otherwise. */
function plan(input: string, creatorRole: Role) {
	const result = parseComposition(input, creatorRole);
	if (!result.ok) throw new Error(`expected \`${input}\` to parse, got: ${result.error}`);
	return result.value;
}

describe('parseComposition', () => {
	it('defaults to the standard Mythic+ five', () => {
		expect(plan('', 'TANK')).toEqual({ total: { TANK: 1, HEALER: 1, DPS: 3 }, reserved: NOTHING_RESERVED });
	});

	it('reads positional shorthand', () => {
		expect(plan('1/1/3', 'DPS')).toEqual({ total: { TANK: 1, HEALER: 1, DPS: 3 }, reserved: NOTHING_RESERVED });
		expect(plan('1-1-2', 'TANK')).toEqual({ total: { TANK: 1, HEALER: 1, DPS: 2 }, reserved: NOTHING_RESERVED });
	});

	it('reads labelled shorthand', () => {
		expect(plan('1t 1h 3d', 'TANK').total).toEqual({ TANK: 1, HEALER: 1, DPS: 3 });
		expect(plan('2 tanks, 2 dps', 'TANK').total).toEqual({ TANK: 2, HEALER: 1, DPS: 2 });
	});

	it('leaves unmentioned roles at the default', () => {
		expect(plan('2 dps', 'DPS').total).toEqual({ TANK: 1, HEALER: 1, DPS: 2 });
	});

	it('rejects parties that do not fit five players', () => {
		expect(parseComposition('2/2/3', 'TANK')).toMatchObject({ ok: false });
		expect(parseComposition('0/0/0', 'DPS')).toMatchObject({ ok: false });
	});

	it("rejects a composition with no slot for the creator's own role", () => {
		const result = parseComposition('1/0/3', 'HEALER');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('Healer');
	});

	it('rejects text it cannot read', () => {
		expect(parseComposition('a full group please', 'TANK')).toMatchObject({ ok: false });
	});
});

describe('parseComposition with a premade', () => {
	it('reserves the rest of a standard party when the creator only needs 2 DPS', () => {
		// Creator is the tank; the healer and one dps are already sorted.
		expect(plan('LF 2 DPS', 'TANK')).toEqual({
			total: { TANK: 1, HEALER: 1, DPS: 3 },
			reserved: { TANK: 0, HEALER: 1, DPS: 1 },
		});
	});

	it('accounts for the creator being one of the DPS', () => {
		expect(plan('LF 2 DPS', 'DPS')).toEqual({
			total: { TANK: 1, HEALER: 1, DPS: 3 },
			reserved: { TANK: 1, HEALER: 1, DPS: 0 },
		});
	});

	it('handles a group that only needs a tank', () => {
		expect(plan('lf 1 tank', 'HEALER')).toEqual({
			total: { TANK: 1, HEALER: 1, DPS: 3 },
			reserved: { TANK: 0, HEALER: 0, DPS: 3 },
		});
	});

	it('takes an implicit count of one from a bare role word', () => {
		expect(plan('lf tank', 'HEALER')).toEqual(plan('lf 1 tank', 'HEALER'));
		expect(plan('lfm tank', 'HEALER')).toEqual(plan('lf 1 tank', 'HEALER'));
	});

	it('reads the count out of LF2M style shorthand', () => {
		expect(plan('lf2m dps', 'TANK')).toEqual(plan('lf 2 dps', 'TANK'));
	});

	it('accepts other ways of saying it', () => {
		const expected = plan('lf 2 dps', 'TANK');
		for (const input of ['need 2 dps', 'needs 2 dps', 'looking for 2 dps', 'want 2 dps', '+2 dps']) {
			expect(plan(input, 'TANK'), input).toEqual(expected);
		}
	});

	it('combines an explicit total with the open slots', () => {
		expect(plan('2/1/2 lf 1 dps', 'TANK')).toEqual({
			total: { TANK: 2, HEALER: 1, DPS: 2 },
			reserved: { TANK: 1, HEALER: 1, DPS: 1 },
		});
	});

	it('can leave the whole party open apart from the creator', () => {
		expect(plan('lf 1 healer 3 dps', 'TANK')).toEqual({
			total: { TANK: 1, HEALER: 1, DPS: 3 },
			reserved: NOTHING_RESERVED,
		});
	});

	it('does not mistake a plus-separated composition for an LF phrase', () => {
		expect(plan('1+1+3', 'TANK')).toEqual({ total: { TANK: 1, HEALER: 1, DPS: 3 }, reserved: NOTHING_RESERVED });
	});

	it('rejects looking for more of a role than the composition holds', () => {
		const result = parseComposition('lf 2 tanks', 'TANK');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('only has 1 Tank slot');
	});

	it('rejects an LF phrase that leaves nothing open', () => {
		expect(parseComposition('lf 0 dps', 'TANK')).toMatchObject({ ok: false });
	});

	it('rejects an LF phrase it cannot read', () => {
		expect(parseComposition('lf whoever', 'TANK')).toMatchObject({ ok: false });
	});
});
