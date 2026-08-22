import { CRAFT_LIMIT, DEFAULT_QUANTITY, MAX_QUANTITY } from './constants';

export type CraftParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Quantity is optional and defaults to one. People type "5", "x5", and "5x", so
 * a leading or trailing `x` is tolerated — anything else is a typo worth
 * pointing out rather than silently rounding.
 */
export function parseQuantity(input: string | undefined): CraftParseResult<number> {
	const text = (input ?? '').trim().toLowerCase().replace(/^x/, '').replace(/x$/, '').trim();
	if (!text) return { ok: true, value: DEFAULT_QUANTITY };

	if (!/^\d+$/.test(text)) {
		return { ok: false, error: `Could not read the quantity \`${(input ?? '').trim()}\`. Enter a whole number like \`1\` or \`5\`.` };
	}

	const quantity = Number(text);
	if (quantity < 1) return { ok: false, error: 'Quantity has to be at least 1.' };
	if (quantity > MAX_QUANTITY) return { ok: false, error: `Quantity tops out at ${MAX_QUANTITY} per request.` };
	return { ok: true, value: quantity };
}

/**
 * Trims an optional free-text field to null, enforcing the same cap the modal
 * advertises. Discord enforces `max_length` client-side; this is the server-side
 * half of that, because the submission is just JSON.
 */
export function optionalText(input: string | undefined, max: number): CraftParseResult<string | null> {
	const text = (input ?? '').trim();
	if (!text) return { ok: true, value: null };
	if (text.length > max) return { ok: false, error: `That field is limited to ${max} characters.` };
	return { ok: true, value: text };
}

export const CHARACTER_LIMIT = CRAFT_LIMIT.character;
export const DETAILS_LIMIT = CRAFT_LIMIT.details;
