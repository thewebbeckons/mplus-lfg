import { DEFAULT_COMPOSITION, EMPTY_COMPOSITION, PARTY_SIZE, ROLES, ROLE_META } from './constants';
import type { Composition, PartyPlan, Role } from './types';

/**
 * Lenient parsing of the free-text composition input. The bot accepts the
 * shorthand a raid group actually types rather than demanding an exact format.
 */

const ROLE_WORDS: Array<{ pattern: RegExp; role: Role }> = [
	{ pattern: /^(tanks?|tanking|t|prot|brm|vdh|bdk)$/, role: 'TANK' },
	{ pattern: /^(healers?|heals?|healing|h|hps|resto|holy|disc|mw)$/, role: 'HEALER' },
	{ pattern: /^(dps|dd|d|damage|deeps|dmg)$/, role: 'DPS' },
];

export function parseRole(input: string): Role | null {
	const text = input.trim().toLowerCase();
	return ROLE_WORDS.find((entry) => entry.pattern.test(text))?.role ?? null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** "3 dps", "1 tank" — an explicit count attached to a role word. */
const COUNTED_SLOT = /(\d+)\s*(tanks?|healers?|heals?|dps|dd|damage|[thd])\b/g;
/** "tank", "healer" on its own — an implicit count. */
const BARE_SLOT = /\b(tanks?|healers?|heals?|dps|dd|damage|[thd])\b/g;
/** "1/1/3", "1-1-3", "2 1 2" — tank, healer, dps in order. */
const POSITIONAL_SLOTS = /^\D*(\d+)\D+(\d+)\D+(\d+)\D*$/;

/**
 * Splits "still looking for" phrasing off the end of the composition field.
 * `lf2m` / `lfm` / `lf` carry an implicit count for bare role words that follow.
 */
const LF_MARKER = /(?:^|[\s,;])(?:lf(\d+)m?|lfm|lf|looking\s+for|needs?|wants?)\b\s*/;
/** A leading "+2 dps" means the same thing, but `1+1+3` must stay positional. */
const LEADING_PLUS = /^\+\s*/;

function labelToRole(label: string): Role {
	if (label.startsWith('t')) return 'TANK';
	if (label.startsWith('h')) return 'HEALER';
	return 'DPS';
}

function totalOf(slots: Composition): number {
	return ROLES.reduce((sum, role) => sum + slots[role], 0);
}

/**
 * Reads slot counts in any of the shapes people type.
 *
 * @param defaults roles the text does not mention keep these counts.
 * @param implicitCount count to use for role words written without a number.
 */
function parseSlots(text: string, defaults: Composition, implicitCount: number): Composition | null {
	const slots: Composition = { ...defaults };

	let matched = false;
	COUNTED_SLOT.lastIndex = 0;
	for (let match = COUNTED_SLOT.exec(text); match !== null; match = COUNTED_SLOT.exec(text)) {
		slots[labelToRole(match[2])] = Number(match[1]);
		matched = true;
	}
	if (matched) return slots;

	BARE_SLOT.lastIndex = 0;
	for (let match = BARE_SLOT.exec(text); match !== null; match = BARE_SLOT.exec(text)) {
		slots[labelToRole(match[1])] = implicitCount;
		matched = true;
	}
	if (matched) return slots;

	const positional = POSITIONAL_SLOTS.exec(text);
	if (!positional) return null;
	slots.TANK = Number(positional[1]);
	slots.HEALER = Number(positional[2]);
	slots.DPS = Number(positional[3]);
	return slots;
}

interface SplitPlan {
	/** Text describing the whole party, empty when only "looking for" was given. */
	totalText: string;
	/** Text describing the open slots, null when no "looking for" phrasing was used. */
	openText: string | null;
	implicitCount: number;
}

function splitPlan(text: string): SplitPlan {
	if (LEADING_PLUS.test(text)) {
		return { totalText: '', openText: text.replace(LEADING_PLUS, '').trim(), implicitCount: 1 };
	}
	const marker = LF_MARKER.exec(text);
	if (!marker) return { totalText: text, openText: null, implicitCount: 1 };
	return {
		totalText: text.slice(0, marker.index).trim(),
		openText: text.slice(marker.index + marker[0].length).trim(),
		implicitCount: marker[1] ? Number(marker[1]) : 1,
	};
}

const FORMAT_HINT = 'Try `1/1/3` for a fresh group, or `LF 2 DPS` if you already have people.';

/**
 * Works out the party the creator wants and how much of it is already spoken
 * for. Accepts:
 *
 *   (blank)          the standard 1 tank / 1 healer / 3 dps, nothing pre-filled
 *   `1/1/3`          an explicit total composition, nothing pre-filled
 *   `2 tanks 2 dps`  the same, written out
 *   `LF 2 DPS`       a standard party with only 2 dps slots still open — the rest
 *                    is assumed to be the creator plus people they already have
 *   `LF1M tank`      a bare role word takes its count from the marker
 *   `2/1/2 lf 1 dps` an explicit total, of which only 1 dps slot is open
 *
 * Reserved slots are derived rather than asked for, so the creator never has to
 * do the arithmetic: reserved = total − open − the creator's own slot.
 *
 * @param creatorRole the role the creator claimed; their own slot must exist.
 */
export function parseComposition(input: string, creatorRole: Role): ParseResult<PartyPlan> {
	const text = input.trim().toLowerCase();
	if (!text) return { ok: true, value: { total: { ...DEFAULT_COMPOSITION }, reserved: { ...EMPTY_COMPOSITION } } };

	const { totalText, openText, implicitCount } = splitPlan(text);

	const total = totalText ? parseSlots(totalText, DEFAULT_COMPOSITION, 1) : { ...DEFAULT_COMPOSITION };
	if (!total) return { ok: false, error: `Could not read the composition \`${input.trim()}\`. ${FORMAT_HINT}` };

	const size = totalOf(total);
	if (size < 1 || size > PARTY_SIZE) {
		return { ok: false, error: `A Mythic+ party is 1–${PARTY_SIZE} players, but that composition adds up to ${size}.` };
	}
	if (total[creatorRole] < 1) {
		return {
			ok: false,
			error: `You signed up as ${ROLE_META[creatorRole].label}, so the composition needs at least one ${ROLE_META[creatorRole].label} slot.`,
		};
	}

	// No "looking for" phrasing: the whole party is open apart from the creator.
	if (openText === null) return { ok: true, value: { total, reserved: { ...EMPTY_COMPOSITION } } };

	const open = parseSlots(openText, EMPTY_COMPOSITION, implicitCount);
	if (!open) return { ok: false, error: `Could not read what you are looking for in \`${input.trim()}\`. ${FORMAT_HINT}` };
	if (totalOf(open) < 1) {
		return { ok: false, error: 'That says you are not looking for anyone. Leave the composition blank, or say how many slots are open.' };
	}

	const reserved: Composition = { ...EMPTY_COMPOSITION };
	for (const role of ROLES) {
		reserved[role] = total[role] - open[role] - (role === creatorRole ? 1 : 0);
		if (reserved[role] < 0) {
			const label = ROLE_META[role].label;
			const own = role === creatorRole ? ', plus your own spot' : '';
			return {
				ok: false,
				error:
					`You are looking for ${open[role]} ${label}${own}, but the composition only has ${total[role]} ${label} slot(s). ` +
					`Raise the total, e.g. \`1/1/3 lf ${open[role]} ${label}\`.`,
			};
		}
	}

	return { ok: true, value: { total, reserved } };
}
