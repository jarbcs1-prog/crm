/**
 * In-memory TTL cache — SINGLE_INSTANCE_ONLY.
 * Per-process; not shared across replicas. Set REDIS_URL and swap to
 * a Redis-backed impl before scaling beyond 1 instance (see P2-1).
 */
export class TtlCache<T> {
	private readonly entries = new Map<string, { value: T; expiresAt: number }>();

	constructor(private readonly ttlMs: number) {}

	get(key: string): T | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt <= Date.now()) {
			this.entries.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: T): void {
		this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
	}

	delete(key: string): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}
}
