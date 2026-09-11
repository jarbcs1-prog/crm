import type { VqbClause } from "./vqb-types";

export function serializeVqb(clauses: VqbClause[]): string {
	if (clauses.length === 0) return "";
	try {
		return JSON.stringify(clauses);
	} catch {
		return "";
	}
}

export function deserializeVqb(raw: string): VqbClause[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isVqbClause);
	} catch {
		return [];
	}
}

function isVqbClause(value: unknown): value is VqbClause {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.field === "string" &&
		typeof v.operator === "string" &&
		typeof v.value === "string" &&
		(v.conjunction === "and" || v.conjunction === "or")
	);
}

export function vqbSummary(clauses: VqbClause[]): string {
	if (clauses.length === 0) return "";
	return clauses
		.map((c, i) => {
			const prefix = i === 0 ? "" : ` ${c.conjunction.toUpperCase()} `;
			const val = c.value ? ` "${c.value}"` : "";
			return `${prefix}${c.field} ${c.operator}${val}`;
		})
		.join("");
}

export function compileVqbToQuery(clauses: VqbClause[]): {
	q: string;
	filters: Record<string, string>;
} {
	const textTerms: string[] = [];
	const filters: Record<string, string> = {};

	for (const clause of clauses) {
		const isTextField = ![
			"owner",
			"industry",
			"enrichment",
			"stage",
			"company",
		].includes(clause.field);

		if (
			!isTextField &&
			(clause.operator === "is" || clause.operator === "equals")
		) {
			filters[clause.field] = clause.value || "all";
			continue;
		}

		if (
			clause.operator === "contains" ||
			clause.operator === "equals" ||
			clause.operator === "is"
		) {
			if (clause.value) textTerms.push(clause.value);
		} else if (clause.operator === "starts_with" && clause.value) {
			textTerms.push(clause.value);
		}
	}

	return { q: textTerms.join(" "), filters };
}
