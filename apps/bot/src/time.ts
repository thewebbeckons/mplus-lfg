/**
 * Best-effort parsing of the free-text "start time" a run creator types.
 *
 * Anything we can resolve becomes a Unix timestamp so the embed can use Discord's
 * `<t:…>` markup (localised per viewer) and so the cron sweep knows when the run
 * is stale. Anything we cannot resolve is still shown verbatim — a run with an
 * unparseable time is valid, it just falls back to the age-based expiry rule.
 */

/**
 * Timezone abbreviations resolve to IANA zones rather than fixed offsets.
 * Almost nobody who types `CST` means "UTC-6 all year" — they mean US Central
 * time, which is UTC-5 for the eight months it observes daylight saving. Reading
 * the abbreviation literally scheduled every summer run an hour late, so the
 * offset is looked up for the instant the run actually falls on.
 *
 * `ET`/`CT`/`MT`/`PT`/`AKT` are the same zones spelled without a DST claim, and
 * are what people reach for when they are not sure which half of the year it is.
 *
 * Abbreviations that mean different things in different places resolve to the
 * reading a WoW guild means in practice: `CST` is US Central rather than China,
 * `IST` is India, `BST` is the UK.
 */
const TZ_ZONES: Record<string, string> = {
	UTC: 'UTC',
	GMT: 'UTC',
	Z: 'UTC',
	EST: 'America/New_York',
	EDT: 'America/New_York',
	ET: 'America/New_York',
	CST: 'America/Chicago',
	CDT: 'America/Chicago',
	CT: 'America/Chicago',
	MST: 'America/Denver',
	MDT: 'America/Denver',
	MT: 'America/Denver',
	PST: 'America/Los_Angeles',
	PDT: 'America/Los_Angeles',
	PT: 'America/Los_Angeles',
	AKST: 'America/Anchorage',
	AKDT: 'America/Anchorage',
	AKT: 'America/Anchorage',
	HST: 'Pacific/Honolulu',
	BRT: 'America/Sao_Paulo',
	WET: 'Europe/Lisbon',
	WEST: 'Europe/Lisbon',
	BST: 'Europe/London',
	CET: 'Europe/Paris',
	CEST: 'Europe/Paris',
	EET: 'Europe/Athens',
	EEST: 'Europe/Athens',
	MSK: 'Europe/Moscow',
	IST: 'Asia/Kolkata',
	JST: 'Asia/Tokyo',
	KST: 'Asia/Seoul',
	AWST: 'Australia/Perth',
	ACST: 'Australia/Adelaide',
	ACDT: 'Australia/Adelaide',
	AEST: 'Australia/Sydney',
	AEDT: 'Australia/Sydney',
	AET: 'Australia/Sydney',
	NZST: 'Pacific/Auckland',
	NZDT: 'Pacific/Auckland',
};

const UNIT_SECONDS: Record<string, number> = {
	s: 1,
	sec: 1,
	secs: 1,
	second: 1,
	seconds: 1,
	m: 60,
	min: 60,
	mins: 60,
	minute: 60,
	minutes: 60,
	h: 3600,
	hr: 3600,
	hrs: 3600,
	hour: 3600,
	hours: 3600,
	d: 86400,
	day: 86400,
	days: 86400,
};

export interface ParsedStartTime {
	/** Exactly what the user typed, trimmed. */
	raw: string;
	/** Unix seconds, or null when the text could not be resolved. */
	ts: number | null;
}

export interface ParseStartTimeOptions {
	/**
	 * IANA zone a time with no timezone of its own is read in — in practice the
	 * server's configured zone, so members can type "8pm" and mean 8pm where the
	 * guild plays. Naming a zone in the text still overrides it.
	 */
	timezone?: string;
	/** Injectable for tests; defaults to the wall clock. */
	nowMs?: number;
}

const DISCORD_TIMESTAMP = /^<t:(\d{1,12})(?::[tTdDfFR])?>$/;
const RELATIVE = /^(?:in\s+)?((?:\d+\s*[a-z]+\s*)+?)(?:\s+from\s+now)?$/;
const RELATIVE_PART = /(\d+)\s*([a-z]+)/g;
const CLOCK = /^(?:@|at\s+)?(?:(today|tonight|tomorrow)\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\.?\s*([a-z]{1,4})?$/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;

export function parseStartTime(input: string, options: ParseStartTimeOptions = {}): ParsedStartTime {
	const { timezone = 'UTC', nowMs = Date.now() } = options;
	const raw = input.trim();
	const ts = resolve(raw, nowMs, timezone);
	return { raw, ts };
}

function resolve(raw: string, nowMs: number, timezone: string): number | null {
	if (!raw) return null;
	const text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
	const nowSeconds = Math.floor(nowMs / 1000);

	// `<t:1234567890:F>` — pasted straight from another Discord message.
	const discordTag = DISCORD_TIMESTAMP.exec(raw);
	if (discordTag) return Number(discordTag[1]);

	// Bare epoch, seconds or milliseconds.
	if (/^\d{10}$/.test(text)) return Number(text);
	if (/^\d{13}$/.test(text)) return Math.floor(Number(text) / 1000);

	if (/^(now|asap|right now|invites? out)$/.test(text)) return nowSeconds;

	const relative = parseRelative(text);
	if (relative !== null) return nowSeconds + relative;

	const clock = parseClock(text, nowMs, timezone);
	if (clock !== null) return clock;

	// ISO-8601, gated on actually looking like a date. `Date.parse` is wildly
	// lenient — it reads "Grim Batol +11" as November 2001 — and a bogus
	// timestamp is worse than no timestamp, because the cron sweep would expire
	// the run the moment it is posted.
	if (!ISO_LIKE.test(raw)) return null;
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

/** "in 30 mins", "1h30m", "2 hours" -> offset in seconds. */
function parseRelative(text: string): number | null {
	const match = RELATIVE.exec(text);
	if (!match) return null;

	let total = 0;
	let matched = 0;
	RELATIVE_PART.lastIndex = 0;
	for (let part = RELATIVE_PART.exec(match[1]); part !== null; part = RELATIVE_PART.exec(match[1])) {
		const unit = UNIT_SECONDS[part[2]];
		if (unit === undefined) return null;
		total += Number(part[1]) * unit;
		matched++;
	}
	// Require at least one unit, and reject absurd values ("in 900 days").
	if (matched === 0 || total <= 0 || total > 30 * 86400) return null;
	return total;
}

/** "8:00 pm est", "20:00 utc", "tomorrow 9pm" -> absolute Unix seconds. */
function parseClock(text: string, nowMs: number, defaultZone: string): number | null {
	const match = CLOCK.exec(text);
	if (!match) return null;

	const [, dayWord, hourText, minuteText, meridiem, tzText] = match;

	// A bare number is an epoch or nothing at all, not a time of day.
	if (!minuteText && !meridiem && !tzText) return null;

	let hour = Number(hourText);
	const minute = minuteText ? Number(minuteText) : 0;
	if (minute > 59) return null;
	if (meridiem) {
		if (hour < 1 || hour > 12) return null;
		hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
	} else if (hour > 23) {
		return null;
	}

	// Naming a zone overrides the default rather than replacing the feature: people
	// type "8pm EST" out of habit, and reading that as the server's zone instead
	// would be silently wrong by however far apart the two sit.
	const zone = tzText ? TZ_ZONES[tzText.toUpperCase()] : defaultZone;
	if (zone === undefined) return null;

	try {
		// "8pm" means 8pm on whatever day it currently is *in that zone*, which is
		// not always the same calendar day it is in UTC.
		const today = zoneWallClock(zone, nowMs);
		let target = instantInZone(zone, today.year, today.month, today.day, hour, minute);

		// "8pm" said at 9pm means tomorrow. Roll by a calendar day rather than
		// 86_400_000ms: the day a clock change lands on is 23 or 25 hours long.
		if (dayWord === 'tomorrow' || (!dayWord && target <= nowMs)) {
			target = instantInZone(zone, today.year, today.month, today.day + 1, hour, minute);
		}
		return Math.floor(target / 1000);
	} catch {
		// A runtime without timezone data. Better to show the text verbatim than to
		// invent a timestamp the cron sweep would act on.
		return null;
	}
}

interface WallClock {
	year: number;
	/** 1-12, as `Intl` reports it — not the 0-11 `Date` uses. */
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

const ZONE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
	let formatter = ZONE_FORMATTERS.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			// `h23` rather than `hour12: false`, which reports midnight as hour 24.
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		ZONE_FORMATTERS.set(timeZone, formatter);
	}
	return formatter;
}

/** What a clock in `timeZone` reads at the given instant. */
function zoneWallClock(timeZone: string, atMs: number): WallClock {
	const parts = zoneFormatter(timeZone).formatToParts(new Date(atMs));
	const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
	return {
		year: read('year'),
		month: read('month'),
		day: read('day'),
		hour: read('hour'),
		minute: read('minute'),
		second: read('second'),
	};
}

/** How far `timeZone` sits from UTC at the given instant, in minutes. */
function zoneOffsetMinutes(timeZone: string, atMs: number): number {
	const wall = zoneWallClock(timeZone, atMs);
	const asIfUTC = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
	// `Date.UTC` has no sub-second component, so compare against a whole second.
	return (asIfUTC - Math.floor(atMs / 1000) * 1000) / 60_000;
}

/**
 * The instant at which a clock in `timeZone` reads the given date and time.
 * `month` is 1-12 and `day` may overflow its month, the way `Date.UTC` allows.
 */
function instantInZone(timeZone: string, year: number, month: number, day: number, hour: number, minute: number): number {
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	// The offset depends on the instant and the instant depends on the offset, so
	// guess using the offset in force at the wall-clock reading and correct once.
	// That settles every case except a time inside a spring-forward gap, which
	// never happens — those land on the hour after the gap, which is the closest
	// real instant to what was asked for.
	const guess = wall - zoneOffsetMinutes(timeZone, wall) * 60_000;
	return wall - zoneOffsetMinutes(timeZone, guess) * 60_000;
}

/** Render for an embed: localised Discord markup when resolved, plain text otherwise. */
export function formatStartTime(group: { start_time: string; start_ts: number | null }): string {
	if (group.start_ts === null) return group.start_time;
	return `<t:${group.start_ts}:f> · <t:${group.start_ts}:R>`;
}
