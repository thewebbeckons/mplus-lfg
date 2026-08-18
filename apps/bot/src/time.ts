/**
 * Best-effort parsing of the free-text "start time" a run creator types.
 *
 * Anything we can resolve becomes a Unix timestamp so the embed can use Discord's
 * `<t:…>` markup (localised per viewer) and so the cron sweep knows when the run
 * is stale. Anything we cannot resolve is still shown verbatim — a run with an
 * unparseable time is valid, it just falls back to the age-based expiry rule.
 */

/**
 * Fixed UTC offsets in minutes. Abbreviations are inherently ambiguous; these are
 * the readings a WoW guild means in practice (`BST` = British Summer Time).
 */
const TZ_OFFSET_MINUTES: Record<string, number> = {
	UTC: 0,
	GMT: 0,
	Z: 0,
	EST: -300,
	EDT: -240,
	CST: -360,
	CDT: -300,
	MST: -420,
	MDT: -360,
	PST: -480,
	PDT: -420,
	AKST: -540,
	AKDT: -480,
	HST: -600,
	BRT: -180,
	WET: 0,
	WEST: 60,
	BST: 60,
	CET: 60,
	CEST: 120,
	EET: 120,
	EEST: 180,
	MSK: 180,
	IST: 330,
	JST: 540,
	KST: 540,
	AWST: 480,
	ACST: 570,
	AEST: 600,
	AEDT: 660,
	NZST: 720,
	NZDT: 780,
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

const DISCORD_TIMESTAMP = /^<t:(\d{1,12})(?::[tTdDfFR])?>$/;
const RELATIVE = /^(?:in\s+)?((?:\d+\s*[a-z]+\s*)+?)(?:\s+from\s+now)?$/;
const RELATIVE_PART = /(\d+)\s*([a-z]+)/g;
const CLOCK = /^(?:@|at\s+)?(?:(today|tonight|tomorrow)\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\.?\s*([a-z]{1,4})?$/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;

/** @param nowMs injectable for tests; defaults to wall clock. */
export function parseStartTime(input: string, nowMs: number = Date.now()): ParsedStartTime {
	const raw = input.trim();
	const ts = resolve(raw, nowMs);
	return { raw, ts };
}

function resolve(raw: string, nowMs: number): number | null {
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

	const clock = parseClock(text, nowMs);
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
function parseClock(text: string, nowMs: number): number | null {
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

	let offsetMinutes = 0;
	if (tzText) {
		const known = TZ_OFFSET_MINUTES[tzText.toUpperCase()];
		if (known === undefined) return null;
		offsetMinutes = known;
	}

	// Work in "local" time by shifting the clock, then shift the result back.
	const offsetMs = offsetMinutes * 60_000;
	const local = new Date(nowMs + offsetMs);
	let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute) - offsetMs;

	if (dayWord === 'tomorrow') {
		target += 86_400_000;
	} else if (!dayWord && target <= nowMs) {
		// "8pm" said at 9pm means tomorrow.
		target += 86_400_000;
	}
	return Math.floor(target / 1000);
}

/** Render for an embed: localised Discord markup when resolved, plain text otherwise. */
export function formatStartTime(group: { start_time: string; start_ts: number | null }): string {
	if (group.start_ts === null) return group.start_time;
	return `<t:${group.start_ts}:f> · <t:${group.start_ts}:R>`;
}
