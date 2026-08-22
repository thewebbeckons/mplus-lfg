import { CRAFT_LIMIT } from './constants';

/**
 * Strict validation of the Wowhead item link a requester pastes in.
 *
 * The link is stored verbatim and rendered as a "View on Wowhead" button, so it
 * is treated as untrusted input throughout: an allowlist of exact hosts, HTTPS
 * only, and a path shape that must be an *item* page. The bot never fetches the
 * submitted URL — only the numeric item id is used, and only against Blizzard's
 * own API — so a link that slips through still cannot make the Worker talk to a
 * host the requester chose.
 */

/**
 * Exact hosts accepted, lowercase. Wowhead serves retail from the apex domain
 * and from a per-language subdomain; every other subdomain (`classic.`, `ptr.`,
 * `www.wowhead.com.evil.test`) is rejected by the exact match.
 */
const ALLOWED_HOSTS = new Set([
	'wowhead.com',
	'www.wowhead.com',
	'de.wowhead.com',
	'es.wowhead.com',
	'fr.wowhead.com',
	'it.wowhead.com',
	'pt.wowhead.com',
	'ru.wowhead.com',
	'ko.wowhead.com',
	'cn.wowhead.com',
]);

/**
 * Language prefixes Wowhead also expresses as a leading path segment.
 *
 * Deliberately does not include the game-version segments (`classic`, `cata`,
 * `mop-classic`, `ptr`, `ptr-2`, `beta`, …): those are separate game versions,
 * whose item ids do not line up with the Retail data this bot resolves against,
 * so they fall through to the "not a Retail item link" rejection.
 */
const LOCALE_SEGMENTS = new Set(['en', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'ko', 'cn']);

/** `item=12345`, and nothing that merely starts that way. */
const ITEM_SEGMENT = /^item=(\d{1,9})$/;

/** Wowhead ids are well inside this; the bound just keeps nonsense out of D1. */
const MAX_ITEM_ID = 999_999_999;

export interface WowheadItemLink {
	itemId: number;
	/** The submitted URL, trimmed and otherwise untouched. */
	url: string;
	/** Slug segment after the item id, when the link carried one. */
	slug: string | null;
}

export type WowheadParseResult = { ok: true; value: WowheadItemLink } | { ok: false; error: string };

const FORMAT_HINT = 'Paste a Retail Wowhead item link, e.g. `https://www.wowhead.com/item=222441/charged-claw`.';

export function parseWowheadItemUrl(input: string): WowheadParseResult {
	const url = input.trim();
	if (!url) return { ok: false, error: `A Wowhead item link is required. ${FORMAT_HINT}` };
	if (url.length > CRAFT_LIMIT.itemUrl) {
		return { ok: false, error: `That link is longer than ${CRAFT_LIMIT.itemUrl} characters. ${FORMAT_HINT}` };
	}
	// Whitespace and control characters cannot appear in a pasted link, but they
	// can appear in something crafted to look like one. Non-ASCII is left alone:
	// localised slugs are legitimate, and `new URL` normalises them below.
	if (/[\u0000-\u0020\u007f]/.test(url)) {
		return { ok: false, error: `That does not look like a link. ${FORMAT_HINT}` };
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, error: `Could not read that as a URL. ${FORMAT_HINT}` };
	}

	if (parsed.protocol !== 'https:') {
		return { ok: false, error: `Only \`https://\` Wowhead links are accepted. ${FORMAT_HINT}` };
	}
	// Credentials or an explicit port mean somebody is being creative.
	if (parsed.username || parsed.password || parsed.port) {
		return { ok: false, error: `That link has extra parts the bot will not accept. ${FORMAT_HINT}` };
	}
	if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
		return { ok: false, error: `Only links on wowhead.com are accepted. ${FORMAT_HINT}` };
	}

	const segments = parsed.pathname.split('/').filter(Boolean);
	// An optional language prefix, then the item segment, then an optional slug.
	const start = segments.length > 0 && LOCALE_SEGMENTS.has(segments[0].toLowerCase()) ? 1 : 0;
	const itemSegment = segments[start];
	const slug = segments[start + 1] ?? null;
	if (segments.length > start + 2) {
		return { ok: false, error: `That is not a Retail Wowhead item page. ${FORMAT_HINT}` };
	}

	const match = itemSegment ? ITEM_SEGMENT.exec(itemSegment) : null;
	if (!match) {
		return {
			ok: false,
			error:
				'That is not a Retail Wowhead **item** link — Classic, PTR, spell, and NPC pages are not supported yet. ' +
				FORMAT_HINT,
		};
	}

	const itemId = Number(match[1]);
	if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > MAX_ITEM_ID) {
		return { ok: false, error: `\`${match[1]}\` is not a usable item id. ${FORMAT_HINT}` };
	}

	return { ok: true, value: { itemId, url, slug } };
}

/**
 * A readable name when the Blizzard lookup is unavailable or fails.
 *
 * Wowhead slugs are the item name lowercased and hyphenated, so they read well
 * enough to stand in. Anything else falls back to the bare id.
 */
export function fallbackItemName(link: WowheadItemLink): string {
	if (!link.slug) return `WoW Item #${link.itemId}`;

	let decoded: string;
	try {
		decoded = decodeURIComponent(link.slug);
	} catch {
		decoded = link.slug;
	}

	const words = decoded
		.split('-')
		// The slug is part of a URL the requester chose, so strip it back to the
		// characters an item name can actually contain rather than trusting it to
		// be harmless in an embed title or a DM.
		.map((word) => word.replace(/[^\p{L}\p{N}' ]/gu, '').trim())
		.filter(Boolean);
	if (words.length === 0) return `WoW Item #${link.itemId}`;

	return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
