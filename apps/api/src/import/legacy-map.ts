export type LegacyRow = (string | null)[];

export type LegacyRecord = Record<string, string | null>;

export const MAX_NOTE_LENGTH = 100_000;

const NUL = String.fromCharCode(0);

const HONORIFIC =
	/^(mr|mrs|ms|miss|messrs|dr|prof|sir|madam|dato|datin|hr|ing|mme|mlle)\.?$/i;

export function toRecord(columns: string[], row: LegacyRow): LegacyRecord {
	const record: LegacyRecord = {};
	for (const [index, column] of columns.entries()) {
		record[column] = row[index] ?? null;
	}
	return record;
}

export function clean(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.replaceAll(NUL, "").trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function splitName(
	raw: string | null | undefined,
): { firstName: string; lastName: string | null } | null {
	const name = clean(raw);
	if (!name) return null;

	const [first, ...rest] = name.split(/\s+/);
	if (!first) return null;

	const lastName = rest.join(" ").trim();
	return { firstName: first, lastName: lastName || null };
}

export function jobTitle(raw: string | null | undefined): string | null {
	const value = clean(raw);
	if (!value || value === "-") return null;
	if (HONORIFIC.test(value)) return null;
	return value;
}

export function isEmail(value: string | null | undefined): boolean {
	return (
		typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
	);
}

export function toE164(raw: string | null): string | null {
	const digits = clean(raw)?.replace(/\D/g, "").replace(/^0+/, "") ?? "";
	if (digits.length < 8 || digits.length > 15) return null;
	return `+${digits}`;
}

export function domainFrom(url: string | null): string | null {
	const value = clean(url)?.toLowerCase();
	if (!value) return null;

	const match =
		/^(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)/.exec(
			value,
		);
	return match?.[1] ?? null;
}

export function domainFromEmail(email: string | null): string | null {
	const value = clean(email)?.toLowerCase();
	if (!value) return null;

	const at = value.lastIndexOf("@");
	if (at < 0) return null;

	const domain = value.slice(at + 1);
	return domain.includes(".") ? domain : null;
}

export function toDate(value: string | null): Date | null {
	const raw = clean(value);
	if (!raw) return null;

	const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
	if (!match) return null;

	const [, year, month, day, hours, minutes, seconds] = match;
	if (year === "0000" || month === "00" || day === "00") return null;

	const date = new Date(
		`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`,
	);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function capNote(body: string | null | undefined): string | null {
	const value = clean(body);
	if (!value) return null;
	return value.length > MAX_NOTE_LENGTH
		? value.slice(0, MAX_NOTE_LENGTH)
		: value;
}
