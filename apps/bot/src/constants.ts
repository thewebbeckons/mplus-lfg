import type { Composition, GroupStatus, Role } from './types';

export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Slash commands the bot listens for. */
export const COMMAND_NAME = {
	lfg: 'lfg',
	setup: 'setup',
	settings: 'settings',
} as const;

/** Namespace for every `custom_id` this bot owns. */
export const ID_PREFIX = 'mplus';

export const MODAL_CREATE_ID = `${ID_PREFIX}:create`;
export const MODAL_SETUP_ID = `${ID_PREFIX}:setup`;

export const SETUP_CHANNEL_FIELD = 'lfg_channel';
export const SETUP_TIMEZONE_FIELD = 'lfg_timezone';

/** Used when a guild predates the timezone setting; /setup always writes a real choice. */
export const DEFAULT_TIMEZONE = 'UTC';

/**
 * Timezones offered by /setup, as IANA zone names.
 *
 * A Discord select menu holds at most 25 options, so this is a curated list of
 * the regions WoW realms actually cluster in rather than the full IANA database.
 * Naming the zone rather than an abbreviation is the whole point: `America/Chicago`
 * is unambiguous where `CST` is both US Central and China Standard Time, and it
 * tracks daylight saving on its own.
 */
export const TIMEZONE_CHOICES: readonly { label: string; value: string }[] = [
	{ label: 'US Eastern — New York, Toronto', value: 'America/New_York' },
	{ label: 'US Central — Chicago, Dallas', value: 'America/Chicago' },
	{ label: 'US Mountain — Denver', value: 'America/Denver' },
	{ label: 'US Pacific — Los Angeles, Vancouver', value: 'America/Los_Angeles' },
	{ label: 'Alaska — Anchorage', value: 'America/Anchorage' },
	{ label: 'Hawaii — Honolulu', value: 'Pacific/Honolulu' },
	{ label: 'Brazil — São Paulo', value: 'America/Sao_Paulo' },
	{ label: 'UK & Ireland — London, Dublin', value: 'Europe/London' },
	{ label: 'Portugal — Lisbon', value: 'Europe/Lisbon' },
	{ label: 'Central Europe — Paris, Berlin, Madrid', value: 'Europe/Paris' },
	{ label: 'Eastern Europe — Athens, Helsinki', value: 'Europe/Athens' },
	{ label: 'Russia — Moscow', value: 'Europe/Moscow' },
	{ label: 'South Africa — Johannesburg', value: 'Africa/Johannesburg' },
	{ label: 'India — Kolkata, Mumbai', value: 'Asia/Kolkata' },
	{ label: 'China — Shanghai', value: 'Asia/Shanghai' },
	{ label: 'Korea — Seoul', value: 'Asia/Seoul' },
	{ label: 'Japan — Tokyo', value: 'Asia/Tokyo' },
	{ label: 'Western Australia — Perth', value: 'Australia/Perth' },
	{ label: 'Central Australia — Adelaide', value: 'Australia/Adelaide' },
	{ label: 'Eastern Australia — Sydney, Melbourne', value: 'Australia/Sydney' },
	{ label: 'New Zealand — Auckland', value: 'Pacific/Auckland' },
	{ label: 'UTC', value: DEFAULT_TIMEZONE },
];

const TIMEZONE_VALUES = new Set(TIMEZONE_CHOICES.map((choice) => choice.value));

/** Never trust a submitted select value: the client controls it. */
export function isOfferedTimezone(value: string | undefined): value is string {
	return value !== undefined && TIMEZONE_VALUES.has(value);
}

export const MODAL_FIELD = {
	activity: 'activity',
	startTime: 'start_time',
	role: 'role',
	comp: 'comp',
	notes: 'notes',
} as const;

export const ROLES = ['TANK', 'HEALER', 'DPS'] as const;

/** Role shown as selected when the run creation modal first opens. */
export const DEFAULT_ROLE: Role = 'DPS';

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

/**
 * How long a run's data survives past its start time before the cron deletes it.
 *
 * Nothing reads a run once it has started: the sweep above has already rewritten
 * its message and killed the buttons. Keeping the row after that stores Discord
 * user ids, display names, and whatever was typed into `notes` for no purpose,
 * so retention is deliberately short.
 */
export const PURGE_AFTER_SECONDS = 24 * 60 * 60;

/** Upper bound on runs deleted per invocation, to bound the statement's work. */
export const PURGE_SWEEP_LIMIT = 500;
