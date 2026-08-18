import type { Composition, GroupStatus, Role } from './types';

export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Slash command the bot listens for. */
export const COMMAND_NAME = 'lfg';

/** Namespace for every `custom_id` this bot owns. */
export const ID_PREFIX = 'mplus';

export const MODAL_CREATE_ID = `${ID_PREFIX}:create`;

export const MODAL_FIELD = {
	activity: 'activity',
	startTime: 'start_time',
	role: 'role',
	comp: 'comp',
	notes: 'notes',
} as const;

export const ROLES = ['TANK', 'HEALER', 'DPS'] as const;

interface RoleMeta {
	label: string;
	emoji: string;
	/** Column holding the total slots for this role. */
	neededColumn: 'tank_needed' | 'healer_needed' | 'dps_needed';
	/** Column holding slots the creator already had covered outside Discord. */
	reservedColumn: 'tank_reserved' | 'healer_reserved' | 'dps_reserved';
}

export const ROLE_META: Record<Role, RoleMeta> = {
	TANK: { label: 'Tank', emoji: '🛡️', neededColumn: 'tank_needed', reservedColumn: 'tank_reserved' },
	HEALER: { label: 'Healer', emoji: '💚', neededColumn: 'healer_needed', reservedColumn: 'healer_reserved' },
	DPS: { label: 'DPS', emoji: '⚔️', neededColumn: 'dps_needed', reservedColumn: 'dps_reserved' },
};

/** Statuses that still accept roster changes. */
export const LIVE_STATUSES = ['OPEN', 'FULL'] as const;

export const STATUS_META: Record<GroupStatus, { label: string; emoji: string; color: number }> = {
	OPEN: { label: 'Recruiting', emoji: '📣', color: 0x3b82f6 },
	FULL: { label: 'Full', emoji: '✅', color: 0x22c55e },
	COMPLETED: { label: 'Completed', emoji: '🏆', color: 0xa855f7 },
	CANCELLED: { label: 'Cancelled', emoji: '❌', color: 0xef4444 },
	EXPIRED: { label: 'Expired', emoji: '🕓', color: 0x6b7280 },
};

/** A Mythic+ party is five players; compositions are validated against this. */
export const PARTY_SIZE = 5;

/** Default composition when the creator does not override it. */
export const DEFAULT_COMPOSITION: Composition = { TANK: 1, HEALER: 1, DPS: 3 };

export const EMPTY_COMPOSITION: Composition = { TANK: 0, HEALER: 0, DPS: 0 };

/** Grace period after `start_ts` before the cron sweep expires a run. */
export const EXPIRY_GRACE_SECONDS = 30 * 60;

/** Hard ceiling on how long a run can sit around when we could not parse its start time. */
export const MAX_GROUP_AGE_SECONDS = 4 * 60 * 60;

/** Upper bound on messages the cron sweep edits per invocation, to stay inside subrequest limits. */
export const EXPIRY_SWEEP_LIMIT = 40;
