import { ID_PREFIX } from '../constants';
import type { CraftStatus } from './types';

/** Crafting owns the `mplus:craft:` sub-namespace; LFG ids can never collide with it. */
export const CRAFT_ID_PREFIX = `${ID_PREFIX}:craft`;

export const MODAL_CRAFT_ID = `${CRAFT_ID_PREFIX}:create`;

export const CRAFT_FIELD = {
	itemUrl: 'craft_item_url',
	quantity: 'craft_quantity',
	character: 'craft_character',
	details: 'craft_details',
} as const;

/** Discord text input caps, also enforced server-side on submission. */
export const CRAFT_LIMIT = {
	/** Long enough for a slug plus a full bonus id list. */
	itemUrl: 400,
	quantity: 5,
	character: 100,
	details: 500,
} as const;

/** Nobody is ordering more than this, and it keeps the embed honest. */
export const MAX_QUANTITY = 1000;

export const DEFAULT_QUANTITY = 1;

/** Statuses that still accept claim/release/complete/cancel. */
export const LIVE_CRAFT_STATUSES = ['OPEN', 'CLAIMED'] as const;

export const CRAFT_STATUS_META: Record<CraftStatus, { label: string; emoji: string; color: number }> = {
	OPEN: { label: 'Open', emoji: '🧵', color: 0x3b82f6 },
	CLAIMED: { label: 'In progress', emoji: '🔨', color: 0xf59e0b },
	COMPLETED: { label: 'Completed', emoji: '✅', color: 0x22c55e },
	CANCELLED: { label: 'Cancelled', emoji: '❌', color: 0xef4444 },
	EXPIRED: { label: 'Expired', emoji: '🕓', color: 0x6b7280 },
};

/**
 * Item quality, as the Blizzard API reports it, mapped to the colour the game
 * uses. Only used to tint the embed when the lookup succeeded.
 */
export const QUALITY_COLOR: Record<string, number> = {
	POOR: 0x9d9d9d,
	COMMON: 0xffffff,
	UNCOMMON: 0x1eff00,
	RARE: 0x0070dd,
	EPIC: 0xa335ee,
	LEGENDARY: 0xff8000,
	ARTIFACT: 0xe6cc80,
	HEIRLOOM: 0x00ccff,
};

/**
 * How long an unfinished request sits before the cron sweep expires it.
 *
 * Far longer than an LFG run: a crafting order waits on someone logging in with
 * the right profession, which is a matter of days rather than minutes.
 */
export const CRAFT_EXPIRY_SECONDS = 14 * 24 * 60 * 60;

/** Upper bound on requests expired (and messages rewritten) per invocation. */
export const CRAFT_EXPIRY_SWEEP_LIMIT = 40;

/**
 * How long a request's data survives before the cron deletes it.
 *
 * The row holds Discord user ids, display names, a character name, and free
 * text, so it is deleted once the request can no longer be acted on rather than
 * kept as a permanent ledger.
 */
export const CRAFT_PURGE_AFTER_SECONDS = 30 * 24 * 60 * 60;

/** Upper bound on requests deleted per invocation, to bound the statement's work. */
export const CRAFT_PURGE_SWEEP_LIMIT = 500;
