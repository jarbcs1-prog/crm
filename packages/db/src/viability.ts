import { db } from "./client";

export type PhoneType = "mobile" | "direct" | "unknown";

export interface ViabilityScore {
	score: number;
	phoneType: PhoneType;
	emailValid: boolean;
	hasName: boolean;
	breakdown: {
		phone: number;
		email: number;
		name: number;
	};
}

export interface SegmentFeasibilityResult {
	averageScore: number;
	totalLeads: number;
	missingPhoneCount: number;
	missingPhonePercent: number;
	requiresOSINT: boolean;
	country: string;
	countryId: number;
}

export interface OsintFlag {
	contactId: string;
	reason: string;
	needsOsint: boolean;
	currentScore: number;
	touchpoints: { type: "score" | "threshold"; value: number | string }[];
}

const MOBILE_PREFIXES: Record<string, PhoneType> = {
	"41": "mobile",
	"49": "mobile",
	"44": "mobile",
	"1": "mobile",
	"33": "mobile",
	"39": "mobile",
	"34": "mobile",
	"212": "mobile",
	"213": "mobile",
	"216": "mobile",
	"218": "mobile",
	"220": "mobile",
	"223": "mobile",
	"224": "mobile",
	"225": "mobile",
	"226": "mobile",
	"227": "mobile",
	"228": "mobile",
	"229": "mobile",
	"230": "mobile",
	"231": "mobile",
	"232": "mobile",
	"233": "mobile",
	"234": "mobile",
	"235": "mobile",
	"236": "mobile",
	"237": "mobile",
	"238": "mobile",
	"239": "mobile",
	"240": "mobile",
	"241": "mobile",
	"242": "mobile",
	"243": "mobile",
	"244": "mobile",
	"245": "mobile",
	"246": "mobile",
	"247": "mobile",
	"248": "mobile",
	"249": "mobile",
};

const DIRECT_LINE_PREFIXES: Record<string, boolean> = {
	"212": true,
	"213": true,
	"214": true,
	"215": true,
	"216": true,
	"217": true,
	"218": true,
	"219": true,
	"312": true,
	"313": true,
	"314": true,
	"315": true,
	"402": true,
	"403": true,
	"404": true,
	"405": true,
	"406": true,
	"407": true,
	"408": true,
	"410": true,
	"414": true,
	"415": true,
	"419": true,
	"469": true,
	"478": true,
};

const COUNTRY_IDS: Record<
	string,
	{ id: number; name: string; callingCode: string; iso3166: string }
> = {
	DE: { id: 276, name: "Germany", callingCode: "49", iso3166: "DE" },
	CH: { id: 756, name: "Switzerland", callingCode: "41", iso3166: "CH" },
};

export type CountryInfo = {
	id: number;
	name: string;
	callingCode: string;
	iso3166: string;
};

export function detectPhoneType(phone: string | null | undefined): PhoneType {
	if (!phone) return "unknown";

	const cleaned = phone.replace(/[\s\-()]/g, "");

	if (!cleaned.startsWith("+")) return "unknown";

	const countryCode = cleaned.substring(1).match(/^\d+/)?.[0];
	if (!countryCode) return "unknown";

	if (MOBILE_PREFIXES[countryCode] === "mobile") {
		return "mobile";
	}

	if (DIRECT_LINE_PREFIXES[countryCode]) {
		return "direct";
	}

	return "mobile";
}

export function isValidEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email.trim());
}

export function hasName(
	firstName: string | null | undefined,
	lastName: string | null | undefined,
): boolean {
	return Boolean(firstName?.trim() || lastName?.trim());
}

export function viabilityScore(contact: {
	phone?: string | null;
	email?: string | null;
	firstName?: string | null;
	lastName?: string | null;
}): ViabilityScore {
	let phoneScore = 0;
	let emailScore = 0;
	let nameScore = 0;

	const phoneType = detectPhoneType(contact.phone ?? null);
	if (phoneType === "mobile") {
		phoneScore = 65;
	} else if (phoneType === "direct") {
		phoneScore = 55;
	}

	const emailValid = isValidEmail(contact.email ?? null);
	if (emailValid) {
		emailScore = 25;
	}

	const hasContactName = hasName(
		contact.firstName ?? null,
		contact.lastName ?? null,
	);
	if (hasContactName) {
		nameScore = 10;
	}

	const totalScore = phoneScore + emailScore + nameScore;

	return {
		score: Math.min(100, totalScore),
		phoneType,
		emailValid,
		hasName: hasContactName,
		breakdown: {
			phone: phoneScore,
			email: emailScore,
			name: nameScore,
		},
	};
}

export function getCountryById(id: number): CountryInfo | null {
	for (const key of Object.keys(COUNTRY_IDS)) {
		const info = COUNTRY_IDS[key];
		if (info && info.id === id) {
			return info;
		}
	}
	return null;
}

export function getCountryInfo(iso: string): CountryInfo | null {
	const normalizedIso = iso.toUpperCase();
	return COUNTRY_IDS[normalizedIso] ?? null;
}

export async function segmentFeasibility(
	countryIso: string | "DE" | "CH",
	options?: {
		contactIds?: string[];
	},
): Promise<SegmentFeasibilityResult> {
	const normalizedIso = countryIso.toUpperCase();
	const countryInfo = getCountryInfo(normalizedIso);

	if (!countryInfo) {
		throw new Error(`Unknown country ISO: ${countryIso}`);
	}

	const whereClause = options?.contactIds
		? { id: { in: options.contactIds } }
		: {
				company: {
					is: { countryCode: normalizedIso },
				},
			};

	const contacts = await db.contact.findMany({
		where: whereClause as any,
		select: {
			id: true,
			phone: true,
			email: true,
			firstName: true,
			lastName: true,
		},
	});

	const scores = contacts.map((contact) =>
		viabilityScore({
			phone: contact.phone,
			email: contact.email,
			firstName: contact.firstName,
			lastName: contact.lastName,
		}),
	);

	const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
	const averageScore = contacts.length > 0 ? totalScore / contacts.length : 0;
	const missingPhoneCount = scores.filter(
		(s) => s.breakdown.phone === 0,
	).length;
	const missingPhonePercent =
		contacts.length > 0 ? (missingPhoneCount / contacts.length) * 100 : 100;

	const requiresOSINT = averageScore < 50 || missingPhonePercent > 50;

	return {
		averageScore,
		totalLeads: contacts.length,
		missingPhoneCount,
		missingPhonePercent,
		requiresOSINT,
		country: countryInfo.name,
		countryId: countryInfo.id,
	};
}

export function evaluateOsintRequirement(contact: {
	id: string;
	phone?: string | null;
	email?: string | null;
	firstName?: string | null;
	lastName?: string | null;
}): OsintFlag {
	const score = viabilityScore({
		phone: contact.phone,
		email: contact.email,
		firstName: contact.firstName,
		lastName: contact.lastName,
	});

	const missingPhone = contact.phone === null || contact.phone === undefined;
	const missingEmail = contact.email === null || contact.email === undefined;

	const touchpoints: { type: "score" | "threshold"; value: number | string }[] =
		[];

	if (missingPhone) {
		touchpoints.push({ type: "threshold", value: "missing_phone" });
	}
	if (missingEmail) {
		touchpoints.push({ type: "threshold", value: "missing_email" });
	}
	touchpoints.push({ type: "score", value: score.score });

	if (score.score < 50) {
		touchpoints.push({ type: "threshold", value: 50 });
	}

	const needsOsint = score.score < 50 || missingPhone;

	const reasonParts = needsOsint
		? [
				`Viability score ${score.score} below threshold (50)`,
				missingPhone ? "No phone number available" : null,
				!score.emailValid ? "Invalid email format" : null,
			]
				.filter(Boolean)
				.join(". ")
		: `Viability score ${score.score} meets threshold`;

	return {
		contactId: contact.id,
		reason: reasonParts,
		needsOsint,
		currentScore: score.score,
		touchpoints,
	};
}

export async function getOsintRecommendation(
	contactId: string,
	currentScore: number,
): Promise<{ requiresOsint: boolean; reason: string }> {
	const scoreData = await db.contactFact.findMany({
		where: { contactId, field: "osint_score" },
		orderBy: { observedAt: "desc" },
		take: 1,
	});

	if (scoreData.length > 0 && scoreData[0]) {
		const existingScore = Number(scoreData[0].score);
		return {
			requiresOsint: existingScore < 50,
			reason:
				existingScore < 50
					? `OSINT score ${existingScore} indicates needs verification`
					: `OSINT score ${existingScore} is sufficient`,
		};
	}

	if (currentScore < 50) {
		return {
			requiresOsint: true,
			reason: `Current viability score ${currentScore} below threshold of 50`,
		};
	}

	return {
		requiresOsint: false,
		reason: `Current viability score ${currentScore} meets threshold`,
	};
}
