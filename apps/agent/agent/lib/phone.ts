const E164_RE = /^\+[1-9]\d{6,14}$/;

export function normalizeToE164(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let value = raw.trim();
	if (value.startsWith("00")) value = `+${value.slice(2)}`;
	value = value.replace(/[\s\-()./]/g, "");
	if (!/^\+[1-9]\d{6,14}$/.test(value)) return null;
	return value;
}

export function isValidE164(value: string | null | undefined): value is string {
	if (!value) return false;
	return E164_RE.test(value.trim());
}
