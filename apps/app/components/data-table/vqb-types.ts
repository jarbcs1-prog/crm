export type VqbFieldType = "text" | "select";

export type VqbOperator =
	| "is"
	| "is_not"
	| "contains"
	| "not_contains"
	| "equals"
	| "not_equals"
	| "starts_with"
	| "ends_with"
	| "is_empty"
	| "is_not_empty";

export type VqbField = {
	id: string;
	label: string;
	type: VqbFieldType;
	options?: { value: string; label: string }[];
	placeholder?: string;
};

export type VqbConjunction = "and" | "or";

export type VqbClause = {
	id: string;
	field: string;
	operator: VqbOperator;
	value: string;
	conjunction: VqbConjunction;
};

export const VQB_OPERATORS: Record<
	VqbFieldType,
	{ value: VqbOperator; label: string }[]
> = {
	text: [
		{ value: "contains", label: "contains" },
		{ value: "not_contains", label: "does not contain" },
		{ value: "equals", label: "is" },
		{ value: "not_equals", label: "is not" },
		{ value: "starts_with", label: "starts with" },
		{ value: "ends_with", label: "ends with" },
		{ value: "is_empty", label: "is empty" },
		{ value: "is_not_empty", label: "is not empty" },
	],
	select: [
		{ value: "is", label: "is" },
		{ value: "is_not", label: "is not" },
		{ value: "is_empty", label: "is empty" },
		{ value: "is_not_empty", label: "is not empty" },
	],
};

export function operatorsForField(field: VqbField) {
	return VQB_OPERATORS[field.type];
}

export function isValueOperator(op: VqbOperator) {
	return op !== "is_empty" && op !== "is_not_empty";
}

export const COMPANY_VQB_FIELDS: VqbField[] = [
	{ id: "name", label: "Name", type: "text", placeholder: "Acme" },
	{ id: "domain", label: "Domain", type: "text", placeholder: "acme.com" },
	{ id: "industry", label: "Industry", type: "text", placeholder: "Software" },
	{ id: "city", label: "City", type: "text", placeholder: "San Francisco" },
	{ id: "country", label: "Country", type: "text", placeholder: "USA" },
];

export const CONTACT_VQB_FIELDS: VqbField[] = [
	{ id: "name", label: "Name", type: "text", placeholder: "Jane Doe" },
	{ id: "email", label: "Email", type: "text", placeholder: "jane@acme.com" },
	{ id: "title", label: "Title", type: "text", placeholder: "CEO" },
	{ id: "company", label: "Company", type: "text", placeholder: "Acme" },
];

export const DEAL_VQB_FIELDS: VqbField[] = [
	{ id: "name", label: "Deal", type: "text", placeholder: "Acme — rollout" },
	{
		id: "stage",
		label: "Stage",
		type: "select",
		options: [
			{ value: "DEMO_BOOKED", label: "Demo booked" },
			{ value: "QUALIFIED_TO_BUY", label: "Qualified" },
			{ value: "UNQUALIFIED_TO_BUY", label: "Unqualified" },
			{ value: "DECISION_MAKER_BOUGHT_IN", label: "Decision maker bought in" },
			{ value: "CONTRACT_SENT", label: "Contract sent" },
			{ value: "CLOSED_WON", label: "Closed won" },
			{ value: "CLOSED_LOST", label: "Closed lost" },
		],
	},
	{ id: "owner", label: "Owner", type: "text", placeholder: "Owner name" },
];
