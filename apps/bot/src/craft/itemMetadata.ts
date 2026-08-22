import type { Bindings } from '../env';

/**
 * Item name, quality, and icon from Blizzard's official WoW Game Data API.
 *
 * Deliberately isolated and deliberately optional. `BLIZZARD_CLIENT_ID` and
 * `BLIZZARD_CLIENT_SECRET` are not required for `/craft` to work: without them,
 * or when the lookup fails or is slow, this module returns nulls and the caller
 * falls back to the name in the Wowhead URL. Nothing here ever throws, and
 * nothing here ever fetches a user-supplied URL — only Blizzard's own hosts,
 * addressed by the numeric item id.
 *
 * https://develop.battle.net/documentation/world-of-warcraft/game-data-apis
 */

const TOKEN_URL = 'https://oauth.battle.net/token';

/**
 * Region used for lookups. Item names, qualities, and icons are the same static
 * data in every region, so one is enough and `us` is the safe default.
 */
const REGION = 'us';
const API_BASE = `https://${REGION}.api.blizzard.com`;
const NAMESPACE = `static-${REGION}`;
const LOCALE = 'en_US';

/** Bounded so a slow Blizzard response cannot hold the request open. */
const TOKEN_TIMEOUT_MS = 3_000;
const LOOKUP_TIMEOUT_MS = 4_000;

/** Refresh a little before the real expiry so an in-flight call cannot use a dead token. */
const TOKEN_EXPIRY_SKEW_SECONDS = 60;

export interface ItemMetadata {
	name: string | null;
	/** Quality as the API reports it, e.g. `EPIC`. */
	quality: string | null;
	/** Absolute https URL on Blizzard's render CDN. */
	icon: string | null;
}

export const EMPTY_ITEM_METADATA: ItemMetadata = { name: null, quality: null, icon: null };

interface CachedToken {
	value: string;
	expiresAtSeconds: number;
}

/**
 * Cached per isolate. Battle.net client-credentials tokens last a day, so this
 * saves a round trip on nearly every request without needing shared storage.
 */
let cachedToken: CachedToken | null = null;

/** Only used by tests, which run several credential scenarios in one isolate. */
export function resetItemMetadataCache(): void {
	cachedToken = null;
}

export function hasBlizzardCredentials(env: Bindings): boolean {
	return Boolean(env.BLIZZARD_CLIENT_ID && env.BLIZZARD_CLIENT_SECRET);
}

async function getAccessToken(env: Bindings): Promise<string | null> {
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (cachedToken && cachedToken.expiresAtSeconds > nowSeconds) return cachedToken.value;

	// Client credentials flow: the id and secret go in the Basic auth header,
	// never in the body, the query string, or a log line.
	const credentials = btoa(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`);
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
		signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
	});
	if (!response.ok) {
		// Status only: the body of a failed token request can echo the request back.
		console.error(`Blizzard token request failed: ${response.status}`);
		return null;
	}

	const token = (await response.json()) as { access_token?: string; expires_in?: number };
	if (!token.access_token) return null;

	cachedToken = {
		value: token.access_token,
		expiresAtSeconds: nowSeconds + Math.max((token.expires_in ?? 0) - TOKEN_EXPIRY_SKEW_SECONDS, 0),
	};
	return token.access_token;
}

async function getJson(url: string, token: string): Promise<Record<string, unknown> | null> {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
	});
	if (!response.ok) {
		console.error(`Blizzard lookup failed: ${response.status} ${url}`);
		return null;
	}
	return (await response.json()) as Record<string, unknown>;
}

/** Icons come from Blizzard, but the URL still ends up in an embed, so check it. */
function safeIconUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase();
		if (url.protocol !== 'https:') return null;
		if (host !== 'worldofwarcraft.com' && !host.endsWith('.worldofwarcraft.com')) return null;
		return url.toString();
	} catch {
		return null;
	}
}

function readName(item: Record<string, unknown>): string | null {
	// `locale` narrows `name` to a string, but older responses nest it by locale.
	const name = item.name;
	if (typeof name === 'string' && name.trim()) return name.trim();
	if (name && typeof name === 'object') {
		const localised = (name as Record<string, unknown>)[LOCALE];
		if (typeof localised === 'string' && localised.trim()) return localised.trim();
	}
	return null;
}

function readQuality(item: Record<string, unknown>): string | null {
	const quality = item.quality;
	if (!quality || typeof quality !== 'object') return null;
	const type = (quality as Record<string, unknown>).type;
	return typeof type === 'string' && type.trim() ? type.trim().toUpperCase() : null;
}

function readIcon(media: Record<string, unknown> | null): string | null {
	if (!media || !Array.isArray(media.assets)) return null;
	for (const asset of media.assets) {
		if (asset && typeof asset === 'object' && (asset as Record<string, unknown>).key === 'icon') {
			return safeIconUrl((asset as Record<string, unknown>).value);
		}
	}
	return null;
}

/**
 * Best-effort lookup. Returns nulls rather than throwing for every failure mode
 * — no credentials, a rejected token, a 404 on an id that is not a real item, a
 * timeout — so the caller can create the request either way.
 */
export async function fetchItemMetadata(env: Bindings, itemId: number): Promise<ItemMetadata> {
	if (!hasBlizzardCredentials(env)) return EMPTY_ITEM_METADATA;

	try {
		const token = await getAccessToken(env);
		if (!token) return EMPTY_ITEM_METADATA;

		const item = await getJson(`${API_BASE}/data/wow/item/${itemId}?namespace=${NAMESPACE}&locale=${LOCALE}`, token);
		if (!item) return EMPTY_ITEM_METADATA;

		// The icon lives on a separate media document; a failure there still
		// leaves us with a real name, which is the part that matters.
		const media = await getJson(`${API_BASE}/data/wow/media/item/${itemId}?namespace=${NAMESPACE}`, token).catch(() => null);

		return { name: readName(item), quality: readQuality(item), icon: readIcon(media) };
	} catch (error) {
		console.error(`Item metadata lookup for ${itemId} failed`, error);
		return EMPTY_ITEM_METADATA;
	}
}
