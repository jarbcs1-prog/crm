export async function runLimited<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (limit <= 0) throw new Error("limit must be > 0");
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const idx = next++;
				results[idx] = await fn(items[idx] as T, idx);
			}
		},
	);
	await Promise.all(workers);
	return results;
}
