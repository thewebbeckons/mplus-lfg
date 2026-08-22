import { describe, expect, it } from 'vitest';
import { fallbackItemName, parseWowheadItemUrl } from '../src/craft/wowhead';

function accept(url: string) {
	const result = parseWowheadItemUrl(url);
	if (!result.ok) throw new Error(`expected ${url} to be accepted, got: ${result.error}`);
	return result.value;
}

function reject(url: string): string {
	const result = parseWowheadItemUrl(url);
	if (result.ok) throw new Error(`expected ${url} to be rejected`);
	return result.error;
}

describe('parseWowheadItemUrl — accepted links', () => {
	it('reads the item id from a bare item link', () => {
		expect(accept('https://www.wowhead.com/item=222441')).toMatchObject({ itemId: 222441, slug: null });
	});

	it('reads the item id from a link with a slug', () => {
		expect(accept('https://www.wowhead.com/item=222441/charged-claw')).toMatchObject({
			itemId: 222441,
			slug: 'charged-claw',
		});
	});

	it('accepts the apex domain as well as www', () => {
		expect(accept('https://wowhead.com/item=19019').itemId).toBe(19019);
	});

	it('accepts a language subdomain', () => {
		expect(accept('https://de.wowhead.com/item=19019/thunderfury').itemId).toBe(19019);
	});

	it('accepts a language path prefix', () => {
		expect(accept('https://www.wowhead.com/fr/item=19019/thunderfury').itemId).toBe(19019);
	});

	it('preserves the whole submitted URL, bonus parameters and all', () => {
		const url = 'https://www.wowhead.com/item=222441/charged-claw?bonus=10421:9633:8902&ilvl=639';
		expect(accept(url).url).toBe(url);
	});

	it('preserves a fragment as submitted', () => {
		const url = 'https://www.wowhead.com/item=222441/charged-claw#comments';
		expect(accept(url).url).toBe(url);
	});

	it('trims surrounding whitespace before validating', () => {
		expect(accept('  https://www.wowhead.com/item=222441  ').url).toBe('https://www.wowhead.com/item=222441');
	});
});

describe('parseWowheadItemUrl — rejected links', () => {
	it('rejects an empty submission', () => {
		expect(reject('')).toContain('required');
	});

	it('rejects plain http', () => {
		expect(reject('http://www.wowhead.com/item=222441')).toContain('https://');
	});

	it('rejects a non-Wowhead host', () => {
		expect(reject('https://example.com/item=222441')).toContain('wowhead.com');
	});

	it('rejects a lookalike host that merely ends in the real one', () => {
		expect(reject('https://wowhead.com.evil.test/item=222441')).toContain('wowhead.com');
	});

	it('rejects a lookalike host that merely contains the real one', () => {
		expect(reject('https://notwowhead.com/item=222441')).toContain('wowhead.com');
	});

	it('rejects an unapproved wowhead subdomain', () => {
		expect(reject('https://classic.wowhead.com/item=19019')).toContain('wowhead.com');
	});

	it('rejects credentials embedded in the URL', () => {
		expect(reject('https://user:pass@www.wowhead.com/item=222441')).toContain('extra parts');
	});

	it('rejects an explicit port', () => {
		expect(reject('https://www.wowhead.com:8443/item=222441')).toContain('extra parts');
	});

	it('rejects Classic and other game versions', () => {
		for (const version of ['classic', 'cata', 'wotlk', 'mop-classic', 'ptr', 'ptr-2', 'beta']) {
			expect(reject(`https://www.wowhead.com/${version}/item=19019`)).toContain('item');
		}
	});

	it('rejects non-item Wowhead pages', () => {
		for (const path of ['spell=12345', 'npc=1234', 'quest=99', 'achievement=1']) {
			expect(reject(`https://www.wowhead.com/${path}`)).toContain('item');
		}
	});

	it('rejects a path that only starts with the item marker', () => {
		expect(reject('https://www.wowhead.com/itemset=1234')).toContain('item');
		expect(reject('https://www.wowhead.com/item=12ab')).toContain('item');
	});

	it('rejects a deeper path than an item page has', () => {
		expect(reject('https://www.wowhead.com/item=222441/charged-claw/extra')).toContain('item');
	});

	it('rejects a javascript: URL that names the host in its text', () => {
		expect(reject('javascript:fetch("https://www.wowhead.com/item=1")')).toBeTruthy();
	});

	it('rejects a data: URL', () => {
		expect(reject('data:text/html,<script>alert(1)</script>')).toBeTruthy();
	});

	it('rejects something that is not a URL at all', () => {
		expect(reject('charged claw please')).toBeTruthy();
	});

	it('rejects a link with an embedded newline', () => {
		expect(reject('https://www.wowhead.com/item=1\nhttps://evil.test')).toContain('does not look like a link');
	});

	it('rejects an over-long link rather than truncating it', () => {
		const padded = `https://www.wowhead.com/item=222441?bonus=${'1'.repeat(500)}`;
		expect(reject(padded)).toContain('longer than');
	});

	it('rejects an item id of zero', () => {
		expect(reject('https://www.wowhead.com/item=0')).toContain('not a usable item id');
	});
});

describe('fallbackItemName', () => {
	it('turns a slug into a readable name', () => {
		expect(fallbackItemName(accept('https://www.wowhead.com/item=19019/thunderfury-blessed-blade'))).toBe(
			'Thunderfury Blessed Blade',
		);
	});

	it('decodes a percent-encoded slug', () => {
		expect(fallbackItemName(accept("https://www.wowhead.com/item=1/algari-competitor%27s-cape"))).toBe(
			"Algari Competitor's Cape",
		);
	});

	it('falls back to the item id when there is no slug', () => {
		expect(fallbackItemName(accept('https://www.wowhead.com/item=222441'))).toBe('WoW Item #222441');
	});

	it('strips markdown and mention characters out of a hostile slug', () => {
		const name = fallbackItemName(accept('https://www.wowhead.com/item=1/**everyone**'));
		expect(name).not.toContain('*');
		expect(name).not.toContain('@');
	});

	it('falls back to the item id when a slug sanitises away to nothing', () => {
		expect(fallbackItemName(accept('https://www.wowhead.com/item=1/%2A%2A%2A'))).toBe('WoW Item #1');
	});
});
