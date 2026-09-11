import "@crm/env/load";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/client";
import { ActivityType, RecordSource } from "../src/generated/prisma/enums";

type LegacyCompany = {
	id: string;
	name: string;
	site_url: string;
	address: string;
	phone: string;
	is_active: string;
	created_at: string;
};

type LegacyClient = {
	id: number | string;
	name: string;
	title: string | null;
	address: string | null;
	notes: string | null;
	notes_registry: string | null;
	id_company: number | string;
	is_active: string;
	is_canceled: string;
	created_at: string;
	updated_at: string | null;
	id_status: number | string;
};

type LegacyNote = {
	id: string;
	note: string;
	id_client: string;
	id_user: string;
	created_at: string;
};

const DUMP_DIR = (() => {
	const candidates = [
		resolve(process.cwd(), "sql_dump"),
		resolve(process.cwd(), "../../sql_dump"),
		resolve("F:/crm/sql_dump"),
	];
	for (const c of candidates) if (existsSync(c)) return c;
	return candidates[0]!;
})();

function parseArgs() {
	const args = process.argv.slice(2);
	return {
		dryRun: args.includes("--dry-run"),
		limit: (() => {
			const i = args.indexOf("--limit");
			return i >= 0 ? Number.parseInt(args[i + 1] ?? "", 10) : undefined;
		})(),
		batch: (() => {
			const i = args.indexOf("--batch");
			return i >= 0 ? Number.parseInt(args[i + 1] ?? "", 10) : 500;
		})(),
		only: (() => {
			const i = args.indexOf("--only");
			return i >= 0 ? (args[i + 1] ?? "") : "";
		})(),
	};
}

function splitName(raw: string) {
	const t = raw.trim().replace(/\s+/g, " ");
	if (!t) return { firstName: "Unknown", lastName: null as string | null };
	const parts = t.split(" ");
	if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
	return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function domainFromUrl(raw: string): string | null {
	if (!raw) return null;
	let v = raw.trim();
	if (!v) return null;
	if (!v.includes("://")) v = `https://${v}`;
	try {
		const u = new URL(v);
		let h = u.hostname.toLowerCase();
		if (h.startsWith("www.")) h = h.slice(4);
		if (!h.includes(".")) return null;
		return h;
	} catch {
		return null;
	}
}

function parseDate(raw: string | null | undefined): Date | null {
	if (!raw || raw === "0000-00-00 00:00:00") return null;
	const d = new Date(raw.replace(" ", "T"));
	return Number.isNaN(d.getTime()) ? null : d;
}

async function readCompanies(): Promise<LegacyCompany[]> {
	const p = resolve(DUMP_DIR, "companies_dump.csv");
	if (!existsSync(p)) return [];
	const raw = readFileSync(p, "utf-8");
	const lines = raw.split("\n").filter(Boolean);
	if (lines.length < 2) return [];
	const header = lines[0]!.split(";").map((s) => s.replaceAll('"', "").trim());
	const rows: LegacyCompany[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!;
		if (!line.trim()) continue;
		const cols = splitSemicolonCsv(line);
		const obj: Record<string, string> = {};
		header.forEach((h, idx) => (obj[h] = (cols[idx] ?? "").replaceAll('"', "")));
		rows.push(obj as unknown as LegacyCompany);
	}
	return rows;
}

function splitSemicolonCsv(line: string): string[] {
	const res: string[] = [];
	let cur = "";
	let inQ = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (ch === '"') {
			if (inQ && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else inQ = !inQ;
		} else if (ch === ";" && !inQ) {
			res.push(cur);
			cur = "";
		} else cur += ch;
	}
	res.push(cur);
	return res;
}

async function readClients(limit?: number): Promise<LegacyClient[]> {
	const p = resolve(DUMP_DIR, "clients_dump.csv");
	if (!existsSync(p)) throw new Error(`Missing ${p}`);
	const raw = readFileSync(p, "utf-8").trim();
	if (raw.startsWith("[")) {
		const arr = JSON.parse(raw) as LegacyClient[];
		return typeof limit === "number" ? arr.slice(0, limit) : arr;
	}
	const lines = raw.split("\n").filter(Boolean);
	const header = lines[0]!.split(";").map((s) => s.replaceAll('"', "").trim());
	const rows: LegacyClient[] = [];
	for (let i = 1; i < lines.length; i++) {
		if (typeof limit === "number" && rows.length >= limit) break;
		const cols = splitSemicolonCsv(lines[i]!);
		const obj: Record<string, string> = {};
		header.forEach((h, idx) => (obj[h] = (cols[idx] ?? "").replaceAll('"', "")));
		rows.push(obj as unknown as LegacyClient);
	}
	return rows;
}

async function readNotes(): Promise<LegacyNote[]> {
	const p = resolve(DUMP_DIR, "clients_notes_dump.csv");
	if (!existsSync(p)) return [];
	const raw = readFileSync(p, "utf-8");
	const lines = raw.split("\n").filter(Boolean);
	if (lines.length < 2) return [];
	const header = lines[0]!.split(";").map((s) => s.replaceAll('"', "").trim());
	const rows: LegacyNote[] = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = splitSemicolonCsv(lines[i]!);
		const obj: Record<string, string> = {};
		header.forEach((h, idx) => (obj[h] = (cols[idx] ?? "").replaceAll('"', "")));
		rows.push(obj as unknown as LegacyNote);
	}
	return rows;
}

async function main() {
	const { dryRun, limit, batch, only } = parseArgs();
	console.log(`[import] dump dir: ${DUMP_DIR}`);
	console.log(`[import] dryRun=${dryRun} limit=${limit ?? "all"} batch=${batch} only=${only || "all"}`);

	const owner = await db.user.findFirst({ select: { id: true } });
	if (!owner) throw new Error("No user found — seed or create a user first (bun run db:seed).");
	console.log(`[import] ownerId=${owner.id}`);

	const before = {
		company: await db.company.count(),
		contact: await db.contact.count(),
		activity: await db.activity.count(),
	};
	console.log(`[import] before: ${JSON.stringify(before)}`);

	if (!only || only === "companies") {
		const companies = await readCompanies();
		console.log(`[import] legacy companies: ${companies.length}`);
		let created = 0;
		let skipped = 0;
		for (const c of companies) {
			if (c.id === "1" || c.name === "-- Not Assigned --") {
				skipped++;
				continue;
			}
			const domain = domainFromUrl(c.site_url);
			const id = `legacy_company_${c.id}`;
			const data = {
				id,
				name: c.name.trim() || `Company ${c.id}`,
				domain: domain,
				website: c.site_url || (domain ? `https://${domain}` : null),
				source: RecordSource.IMPORT,
				ownerId: owner.id,
				createdAt: parseDate(c.created_at) ?? new Date(),
			};
			if (dryRun) {
				created++;
				continue;
			}
			try {
				await db.company.upsert({
					where: { id },
					create: data,
					update: { name: data.name, domain: data.domain, website: data.website },
				});
			} catch (e: unknown) {
				if (
					e instanceof Error &&
					(e as unknown as { code?: string }).code === "P2002"
				) {
					await db.company.upsert({
						where: { id },
						create: { ...data, domain: null },
						update: { name: data.name, domain: null, website: data.website },
					});
				} else throw e;
			}
			created++;
		}
		console.log(`[import] companies: created/upserted=${created} skipped=${skipped}`);
	}

	if (!only || only === "contacts") {
		const clients = await readClients(limit);
		console.log(`[import] legacy clients to process: ${clients.length}`);
		let contactsCreated = 0;
		let contactsSkipped = 0;
		let activitiesFromNotes = 0;

		for (let i = 0; i < clients.length; i += batch) {
			const slice = clients.slice(i, i + batch);
			if (dryRun) {
				for (const cl of slice) {
					if (cl.is_active === "0" || !cl.name?.trim()) contactsSkipped++;
					else contactsCreated++;
					if (cl.notes?.trim()) activitiesFromNotes++;
					if (cl.notes_registry?.trim()) activitiesFromNotes++;
				}
				continue;
			}

			await db.$transaction(async (tx) => {
				for (const cl of slice) {
					if (!cl.name?.trim()) {
						contactsSkipped++;
						continue;
					}
					const { firstName, lastName } = splitName(cl.name);
					const companyId = cl.id_company ? `legacy_company_${cl.id_company}` : null;
					const companyExists = companyId
						? await tx.company.findUnique({ where: { id: companyId }, select: { id: true } })
						: null;
					const contactId = `legacy_client_${cl.id}`;
					const createdAt = parseDate(cl.created_at) ?? new Date();
					await tx.contact.upsert({
						where: { id: contactId },
						create: {
							id: contactId,
							firstName,
							lastName,
							title: cl.title?.trim() || null,
							companyId: companyExists?.id ?? null,
							ownerId: owner.id,
							source: RecordSource.IMPORT,
							createdAt,
							lastActivityAt: parseDate(cl.updated_at),
						},
						update: {},
					});
					contactsCreated++;

					const bodies: { body: string; at: Date | null }[] = [];
					if (cl.notes?.trim()) bodies.push({ body: `Legacy notes (client ${cl.id}):\n${cl.notes.trim()}`, at: createdAt });
					if (cl.notes_registry?.trim()) bodies.push({ body: `Legacy registry notes (client ${cl.id}):\n${cl.notes_registry.trim()}`, at: parseDate(cl.updated_at) });
					if (cl.address?.trim()) bodies.push({ body: `Legacy address (client ${cl.id}): ${cl.address.trim()}`, at: createdAt });

					for (const b of bodies) {
						const hash = Buffer.from(b.body.slice(0, 64)).toString("hex").slice(0, 12);
						const actId = `legacy_act_${cl.id}_${hash}`;
						await tx.activity.upsert({
							where: { id: actId },
							create: {
								id: actId,
								type: ActivityType.NOTE,
								body: b.body.slice(0, 8000),
								companyId: companyExists?.id ?? null,
								contactId,
								createdById: owner.id,
								createdAt: b.at ?? createdAt,
								meta: { legacyClientId: String(cl.id), legacyCompanyId: String(cl.id_company) },
							},
							update: {},
						});
						activitiesFromNotes++;
					}
				}
			});
			console.log(`[import] batch ${i / batch + 1}: contacts=${contactsCreated} activities~${activitiesFromNotes}`);
		}
		console.log(`[import] contacts: upserted=${contactsCreated} skipped=${contactsSkipped} activities from notes~${activitiesFromNotes}`);
	}

	if (!only || only === "notes") {
		const notes = await readNotes();
		console.log(`[import] legacy standalone notes: ${notes.length}`);
		if (dryRun) {
			console.log(`[import] (dry-run) would create ${notes.length} activities from clients_notes_dump.csv`);
		} else if (notes.length > 0) {
				const toCreate = notes.slice(0, limit ?? notes.length);
			if (toCreate.length === 0) {
				console.log(`[import] standalone notes: none to create`);
			} else {
				const contactIds = [...new Set(toCreate.map((n) => `legacy_client_${n.id_client}`))];
				const existing = await db.contact.findMany({
					where: { id: { in: contactIds } },
					select: { id: true },
				});
				const existingSet = new Set(existing.map((r) => r.id));
				let made = 0;
				let skippedFk = 0;
				for (let i = 0; i < toCreate.length; i += batch) {
					const slice = toCreate.slice(i, i + batch);
					const data = slice
						.map((n) => {
							const cid = `legacy_client_${n.id_client}`;
							const ok = existingSet.has(cid);
							if (!ok) skippedFk++;
							return {
								id: `legacy_note_${n.id}`,
								type: ActivityType.NOTE,
								body: n.note.slice(0, 8000),
								contactId: ok ? cid : null,
								companyId: null,
								createdById: owner.id,
								createdAt: parseDate(n.created_at) ?? new Date(),
								meta: { legacyNoteId: n.id, legacyClientId: n.id_client },
							};
						});
					await db.activity.createMany({
						data,
						skipDuplicates: true,
					});
					made += data.length;
				}
				console.log(`[import] standalone notes activities created: ${made} (skipped FK ${skippedFk} set to null contact)`);
			}
		}
	}

	const after = {
		company: await db.company.count(),
		contact: await db.contact.count(),
		activity: await db.activity.count(),
	};
	console.log(`[import] after: ${JSON.stringify(after)}`);
	console.log(`[import] delta: companies +${after.company - before.company}, contacts +${after.contact - before.contact}, activities +${after.activity - before.activity}`);
}

main()
	.catch((e) => {
		console.error("[import] failed", e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
