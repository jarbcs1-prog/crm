import { writeFileSync } from "node:fs";
import { db } from "@crm/db";

const URL_RE = /https?:\/\/[^\s;]+/i;

function extractDomain(blob: string): string | null {
	const match = blob.match(URL_RE);
	if (!match) return null;
	let host = match[0].replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
	host = host.replace(/^www\./i, "");
	return host || null;
}

function extractPhones(blob: string): string[] {
	// phones live in the fields AFTER the address (field 0), before the URL
	const afterAddress = blob.split(";").slice(1).join(";").replace(URL_RE, " ");
	const matches = afterAddress.match(/\+?[\d][\d\s().-]{5,}/g) ?? [];
	return matches
		.map((p) => p.replace(/\s{2,}/g, " ").trim())
		.filter((p) => (p.match(/\d/g)?.length ?? 0) >= 7)
		.filter((p) => !/\d{4}-\d{2}-\d{2}/.test(p))
		.filter((p) => !/\d{1,2}:\d{2}:\d{2}/.test(p));
}

function humanizeDomain(domain: string): string {
	const label =
		domain.split(".").slice(0, -1).join(".").split(".").pop() ?? domain;
	return label
		.replace(/[-_]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parse(blob: string) {
	const domain = extractDomain(blob);
	const phones = extractPhones(blob);
	const address = blob.split(";")[0].replace(/\r/g, "").trim();
	return { domain, phones, address };
}

async function main() {
	const rows = await db.company.findMany({
		where: { name: { startsWith: "Company " } },
		select: {
			id: true,
			name: true,
			domain: true,
			phone: true,
			email: true,
			streetAddress: true,
			website: true,
			enrichmentStatus: true,
		},
	});

	writeFileSync(
		"scripts/legacy-company-backup.json",
		JSON.stringify(rows, null, 2),
	);

	const apply = process.env.APPLY === "1";
	let updated = 0;
	let domainCollisions = 0;
	const sampled: unknown[] = [];

	for (const row of rows) {
		const blob = row.name.slice("Company ".length);
		const { domain, phones, address } = parse(blob);
		const name = domain
			? humanizeDomain(domain)
			: address || "Unknown legacy company";
		const phone = phones[0] ?? null;

		const data: Record<string, unknown> = { enrichmentStatus: "PENDING" };
		if (name && name !== row.name) data.name = name;
		if (address && !row.streetAddress) data.streetAddress = address;
		if (phone && !row.phone) data.phone = phone;
		if (domain && !row.website) data.website = `https://${domain}`;

		if (domain && !row.domain) {
			const existing = await db.company.findFirst({ where: { domain } });
			if (!existing) data.domain = domain;
			else domainCollisions += 1;
		}

		if (apply) {
			await db.company.update({ where: { id: row.id }, data });
		}
		updated += 1;

		if (sampled.length < 8) {
			sampled.push({
				id: row.id,
				from: row.name.slice(0, 60),
				to: { name, domain, phone, address },
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				total: rows.length,
				[apply ? "updated" : "planned"]: updated,
				domainCollisions,
				sample: sampled,
			},
			null,
			2,
		),
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
