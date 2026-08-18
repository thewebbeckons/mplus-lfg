import { describe, expect, it } from 'vitest';
import { formatStartTime, parseStartTime } from '../src/time';

const NOW = Date.UTC(2026, 7, 16, 18, 30); // 2026-08-16T18:30:00Z
const seconds = (ms: number) => Math.floor(ms / 1000);

describe('parseStartTime', () => {
	it('reads relative offsets', () => {
		expect(parseStartTime('in 30 mins', NOW).ts).toBe(seconds(NOW) + 30 * 60);
		expect(parseStartTime('1h30m', NOW).ts).toBe(seconds(NOW) + 90 * 60);
		expect(parseStartTime('2 hours', NOW).ts).toBe(seconds(NOW) + 2 * 3600);
		expect(parseStartTime('45 minutes from now', NOW).ts).toBe(seconds(NOW) + 45 * 60);
	});

	it('reads epochs and pasted Discord timestamps', () => {
		expect(parseStartTime('<t:1750000000:F>', NOW).ts).toBe(1750000000);
		expect(parseStartTime('1750000000', NOW).ts).toBe(1750000000);
		expect(parseStartTime('1750000000000', NOW).ts).toBe(1750000000);
	});

	it('reads clock times with a timezone', () => {
		// 20:00 UTC is still ahead of 18:30 UTC, so it stays on the same day.
		expect(parseStartTime('20:00 UTC', NOW).ts).toBe(seconds(Date.UTC(2026, 7, 16, 20, 0)));
		// 8pm EST is 01:00 UTC the next day.
		expect(parseStartTime('8:00 PM EST', NOW).ts).toBe(seconds(Date.UTC(2026, 7, 17, 1, 0)));
		expect(parseStartTime('9pm CEST', NOW).ts).toBe(seconds(Date.UTC(2026, 7, 16, 19, 0)));
	});

	it('rolls a time that already passed today over to tomorrow', () => {
		expect(parseStartTime('2:00 PM UTC', NOW).ts).toBe(seconds(Date.UTC(2026, 7, 17, 14, 0)));
	});

	it('honours an explicit "tomorrow"', () => {
		expect(parseStartTime('tomorrow 9pm utc', NOW).ts).toBe(seconds(Date.UTC(2026, 7, 17, 21, 0)));
	});

	it('falls back to ISO parsing', () => {
		expect(parseStartTime('2026-09-01T18:00:00Z', NOW).ts).toBe(seconds(Date.UTC(2026, 8, 1, 18, 0)));
	});

	it('keeps unparseable text as-is instead of guessing', () => {
		for (const input of ['whenever people show up', 'after raid', 'Grim Batol +11', '1st pull']) {
			const parsed = parseStartTime(input, NOW);
			expect(parsed.ts, input).toBeNull();
			expect(parsed.raw).toBe(input);
		}
	});

	it('rejects nonsense clock values and absurd offsets', () => {
		expect(parseStartTime('25:99 UTC', NOW).ts).toBeNull();
		expect(parseStartTime('13:00 pm utc', NOW).ts).toBeNull();
		expect(parseStartTime('in 900 days', NOW).ts).toBeNull();
	});
});

describe('formatStartTime', () => {
	it('uses Discord markup when the time resolved', () => {
		expect(formatStartTime({ start_time: 'in 30 mins', start_ts: 1750000000 })).toBe('<t:1750000000:f> · <t:1750000000:R>');
	});

	it('echoes the raw text otherwise', () => {
		expect(formatStartTime({ start_time: 'after raid', start_ts: null })).toBe('after raid');
	});
});
