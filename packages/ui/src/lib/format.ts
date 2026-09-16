export function formatCount(count: number, noun: string): string {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

const WELL_FORMED_CURRENCY_CODE = /^[A-Za-z]{3}$/;

function displayCurrencyCode(currency: string): string {
	return WELL_FORMED_CURRENCY_CODE.test(currency)
		? currency.toUpperCase()
		: "USD";
}

const NF_PCT = new Intl.NumberFormat(undefined, {
	style: "percent",
	maximumFractionDigits: 0,
});

const DF = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const DF_SHORT = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

const NF_USD = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 0,
});

const NF_USD_F2 = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
});

const NF_USD_COMPACT = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
	notation: "compact",
	maximumFractionDigits: 0,
});

const NF_USD_COMPACT_F1 = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
	notation: "compact",
	maximumFractionDigits: 1,
});

const moneyCache = new Map<string, Intl.NumberFormat>();

function getMoneyFormatter(
	currency: string,
	fractionDigits: number,
): Intl.NumberFormat {
	const key = `${currency}:${fractionDigits}`;
	let f = moneyCache.get(key);
	if (!f) {
		f = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			minimumFractionDigits: fractionDigits,
		});
		moneyCache.set(key, f);
	}
	return f;
}

function getMoneyCompactFormatter(
	currency: string,
	fractionDigits: number,
): Intl.NumberFormat {
	const key = `${currency}:compact:${fractionDigits}`;
	let f = moneyCache.get(key);
	if (!f) {
		f = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			notation: "compact",
			maximumFractionDigits: fractionDigits,
		});
		moneyCache.set(key, f);
	}
	return f;
}

export function formatMoney(cents: number, currency = "usd"): string {
	const code = displayCurrencyCode(currency);
	const fractionDigits = cents % 100 === 0 ? 0 : 2;
	if (code === "USD")
		return (fractionDigits === 0 ? NF_USD : NF_USD_F2).format(cents / 100);
	return getMoneyFormatter(code, fractionDigits).format(cents / 100);
}

export function formatMoneyCompact(cents: number, currency = "usd"): string {
	const code = displayCurrencyCode(currency);
	const fractionDigits = cents % 100_000 === 0 ? 0 : 1;
	if (code === "USD")
		return (fractionDigits === 0 ? NF_USD_COMPACT : NF_USD_COMPACT_F1).format(
			cents / 100,
		);
	return getMoneyCompactFormatter(code, fractionDigits).format(cents / 100);
}

export function formatPercent(rate: number): string {
	return NF_PCT.format(rate);
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function toDay(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDay(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	const [year, month, day] = value.slice(0, 10).split("-").map(Number);
	if (!year || !month || !day) return undefined;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDay(value: string | null | undefined): string {
	const date = fromDay(value);
	return date ? DF.format(date) : (value ?? "—");
}

export function relativeTimeFromIso(iso: string | null | undefined): string {
	if (!iso) return "—";
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return "—";
	const diff = Date.now() - then;
	const abs = Math.abs(diff);
	const min = 60_000;
	const hour = 60 * min;
	const day = 24 * hour;
	if (abs < min) return "just now";
	const distance =
		abs < hour
			? `${Math.round(abs / min)}m`
			: abs < day
				? `${Math.round(abs / hour)}h`
				: abs < 30 * day
					? `${Math.round(abs / day)}d`
					: null;
	if (distance === null) {
		return DF_SHORT.format(new Date(iso));
	}
	return diff < 0 ? `in ${distance}` : `${distance} ago`;
}

export function initialsFromName(name: string | null | undefined): string {
	const parts = (name ?? "").split(/\s+/).filter(Boolean);
	const first = parts[0];
	if (!first) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const last = parts[parts.length - 1] ?? first;
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
