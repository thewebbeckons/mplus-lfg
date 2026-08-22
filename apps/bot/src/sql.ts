/** Shared D1 primitives used by more than one feature's access layer. */

/** Typed rows out of a `batch()` slot, tolerating a statement that returned none. */
export function rowsOf<T>(result: D1Result | undefined): T[] {
	return (result?.results ?? []) as unknown as T[];
}

/**
 * `?1, ?2, …` for an `IN` list of the given length.
 *
 * @param offset how many bind parameters the statement already used.
 */
export function placeholders(count: number, offset = 0): string {
	return Array.from({ length: count }, (_, index) => `?${index + 1 + offset}`).join(', ');
}
