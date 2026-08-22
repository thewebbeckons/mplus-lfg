export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Slash commands the bot listens for. */
export const COMMAND_NAME = {
	lfg: 'lfg',
	craft: 'craft',
	setup: 'setup',
	settings: 'settings',
} as const;

/**
 * Namespace for every `custom_id` this bot owns.
 *
 * Kept as `mplus` rather than renamed with the display name: buttons on posts
 * that already exist in people's servers carry this prefix, and changing it
 * would make every one of them stop working.
 */
export const ID_PREFIX = 'mplus';

export const MODAL_SETUP_ID = `${ID_PREFIX}:setup`;

export const SETUP_CHANNEL_FIELD = 'lfg_channel';
export const SETUP_TIMEZONE_FIELD = 'lfg_timezone';
export const SETUP_CRAFT_CHANNEL_FIELD = 'craft_channel';
export const SETUP_CRAFTER_ROLE_FIELD = 'crafter_role';

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
