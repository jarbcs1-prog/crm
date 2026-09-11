export function recordHref(
	list: "/companies" | "/contacts" | "/deals",
	kind: "company" | "contact" | "deal",
	id: string,
): string {
	return `${list}?${new URLSearchParams({ record: `${kind}:${id}` })}`;
}
