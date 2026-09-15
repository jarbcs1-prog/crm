export function collapsing<A extends unknown[]>(
	run: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
	let active: Promise<void> | null = null;
	let trailing: Map<string, A> | null = null;

	const keyFor = (args: A): string => {
		try {
			return JSON.stringify(args);
		} catch {
			return String(args);
		}
	};

	const invoke = async (...args: A): Promise<void> => {
		if (active) {
			if (!trailing) trailing = new Map<string, A>();
			trailing.set(keyFor(args), args);
			return active;
		}

		active = run(...args);

		let failure: { error: unknown } | null = null;

		try {
			await active;
		} catch (error) {
			failure = { error };
		} finally {
			active = null;
		}

		const pending = trailing;
		trailing = null;

		if (pending) {
			for (const nextArgs of pending.values()) {
				const catchUp = invoke(...nextArgs);
				try {
					await catchUp;
				} catch (error) {
					console.warn({ message: "collapsing catchUp failed", error });
					if (!failure) throw error;
				}
				if (failure) break;
			}
		}

		if (failure) throw failure.error;
	};

	return invoke;
}

export async function runLimited<T>(
	concurrency: number,
	items: readonly T[],
	run: (item: T) => Promise<void>,
): Promise<void> {
	const width = Math.max(1, Math.min(concurrency, items.length));
	const queue = items[Symbol.iterator]();

	const workers = Array.from({ length: width }, async () => {
		for (const item of queue) await run(item);
	});

	await Promise.all(workers);
}
