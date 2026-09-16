export const TASK_KINDS = [
	"brand",
	"portrait",
	"meeting-prep",
	"identify",
	"profile",
	"call",
	"osint-enrich",
	"recheck",
	"company-profile",
	"workspace-profile",
	"verify",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const DIRECT_KINDS = ["brand", "portrait"] as const;

export type DirectKind = (typeof DIRECT_KINDS)[number];

export function isDirectKind(kind: string): kind is DirectKind {
	return (DIRECT_KINDS as readonly string[]).includes(kind);
}

export const PRIORITY = {
	brand: 900,
	portrait: 800,
	workspace: 500,
	requested: 300,
	meeting: 200,
	call: 150,
	identify: 100,
	osintEnrich: 60,
	verify: 60,
	sweep: 50,
	companyProfile: 40,
	recheck: 0,
} as const;
