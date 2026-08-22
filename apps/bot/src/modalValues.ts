/**
 * Reading a modal submission's component tree.
 *
 * Discord has shipped more than one nesting shape for modal components (plain
 * action rows, and label-wrapped inputs), so these recurse instead of assuming
 * a fixed depth.
 */

/**
 * Every text `value`, and the first entry of every non-empty `values` array,
 * keyed by `custom_id`.
 */
export function collectModalValues(node: unknown, into: Map<string, string> = new Map()): Map<string, string> {
	if (Array.isArray(node)) {
		for (const child of node) collectModalValues(child, into);
		return into;
	}
	if (node === null || typeof node !== 'object') return into;

	const record = node as Record<string, unknown>;
	if (typeof record.custom_id === 'string') {
		if (typeof record.value === 'string') {
			into.set(record.custom_id, record.value);
		} else if (Array.isArray(record.values) && typeof record.values[0] === 'string') {
			into.set(record.custom_id, record.values[0]);
		}
	}
	if ('components' in record) collectModalValues(record.components, into);
	if ('component' in record) collectModalValues(record.component, into);
	return into;
}

/**
 * Every select menu that was submitted, *including* the ones submitted empty.
 *
 * `collectModalValues` cannot tell "the admin cleared this optional picker" from
 * "this picker was not part of the form", because both look like no value. An
 * optional setting needs that distinction to be clearable, so it reads the raw
 * arrays instead: present-and-empty means clear, absent means leave alone.
 */
export function collectModalSelections(node: unknown, into: Map<string, string[]> = new Map()): Map<string, string[]> {
	if (Array.isArray(node)) {
		for (const child of node) collectModalSelections(child, into);
		return into;
	}
	if (node === null || typeof node !== 'object') return into;

	const record = node as Record<string, unknown>;
	if (typeof record.custom_id === 'string' && Array.isArray(record.values)) {
		into.set(
			record.custom_id,
			record.values.filter((value): value is string => typeof value === 'string'),
		);
	}
	if ('components' in record) collectModalSelections(record.components, into);
	if ('component' in record) collectModalSelections(record.component, into);
	return into;
}
