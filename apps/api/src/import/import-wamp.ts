import "@crm/env/load";

import {
	ContactMethodKind,
	ContactVerificationStatus,
	db,
	LegacyImportModel,
	RecordSource,
} from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	capNote,
	clean,
	domainFrom,
	domainFromEmail,
	isEmail,
	jobTitle,
	type LegacyRecord,
	type LegacyRow,
	splitName,
	toDate,
	toE164,
	toRecord,
} from "./legacy-map";
import { parseInsert, readStatements } from "./sql-scanner";

const NEEDED_TABLES = new Set([
	"clients",
	"client_contacts",
	"companies",
	"countries",
	"lists",
	"phone_types",
	"statuses",
	"users",
]);

const VERIFY_CHUNK = 1_000;

const LEGACY_CONTACT_PREFIX = "legacy_client_";
const LEGACY_COMPANY_PREFIX = "legacy_company_";

function legacyContactId(legacyId: string): string {
	return `${LEGACY_CONTACT_PREFIX}${legacyId}`;
}

function legacyCompanyId(legacyId: string): string {
	return `${LEGACY_COMPANY_PREFIX}${legacyId}`;
}

export type Options = {
	dryRun: boolean;
	limit: number | null;
	userId: string | null;
	batchSize: number;
};

export type Table = { columns: string[]; rows: LegacyRow[] };
export type Tables = Map<string, Table>;

type Lookups = {
	countries: Map<string, { name: string | null; iso3166: string | null }>;
	statuses: Map<string, string>;
	lists: Map<string, string>;
	phoneTypes: Map<string, string>;
	owners: Map<string, string>;
};

export type Summary = {
	companies: number;
	contacts: number;
	methods: number;
	activities: number;
	skipped: number;
	deduped: number;
	e164Failed: number;
	honorificTitles: number;
	lookupMisses: number;
	verifyContacts: number;
	verifyQueued: number;
	verifyAlreadyQueued: number;
};

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const path = clean(process.env.LEGACY_CRM_SQL_PATH);

	if (!path) {
		console.error(
			"LEGACY_CRM_SQL_PATH is not set. Point it at crm_final.sql and run again.",
		);
		process.exitCode = 1;
		return;
	}

	if (!options.dryRun && !options.userId) {
		console.error(
			"--userId <uuid> is required unless --dry-run is set: Activity.createdById has no default.",
		);
		process.exitCode = 1;
		return;
	}

	const summary = emptySummary();
	console.log(`${options.dryRun ? "Dry run" : "Import"}: reading ${path}`);

	const tables = await loadTables(path);
	const lookups = await buildLookups(tables, options);

	const companiesByLegacyId = await importCompanies(
		tables,
		lookups,
		summary,
		options,
	);
	const contactsByLegacyId = await importContacts(
		tables,
		lookups,
		companiesByLegacyId,
		summary,
		options,
	);

	await importMethods(tables, lookups, contactsByLegacyId, summary, options);
	await importActivities(
		tables,
		contactsByLegacyId,
		companiesByLegacyId,
		summary,
		options,
	);
	await enqueueVerification(contactsByLegacyId, summary, options);

	report(summary, options);
	await db.$disconnect();
}

export function parseArgs(argv: string[]): Options {
	const options: Options = {
		dryRun: false,
		limit: null,
		userId: null,
		batchSize: 100,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}

		if (arg === "--limit") {
			const value = Number.parseInt(argv[index + 1] ?? "", 10);
			options.limit = Number.isNaN(value) || value < 1 ? null : value;
			index += 1;
			continue;
		}

		if (arg === "--userId") {
			options.userId = clean(argv[index + 1] ?? null);
			index += 1;
			continue;
		}

		if (arg === "--batchSize") {
			const value = Number.parseInt(argv[index + 1] ?? "", 10);
			options.batchSize =
				Number.isNaN(value) || value < 1 ? 100 : Math.min(value, 1000);
			index += 1;
		}
	}

	return options;
}

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
	const width = Math.max(1, Math.min(size, 1000));
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += width) {
		chunks.push(items.slice(index, index + width));
	}
	return chunks;
}

function emptySummary(): Summary {
	return {
		companies: 0,
		contacts: 0,
		methods: 0,
		activities: 0,
		skipped: 0,
		deduped: 0,
		e164Failed: 0,
		honorificTitles: 0,
		lookupMisses: 0,
		verifyContacts: 0,
		verifyQueued: 0,
		verifyAlreadyQueued: 0,
	};
}

export async function loadTables(path: string): Promise<Tables> {
	const tables: Tables = new Map();

	for await (const statement of readStatements(path)) {
		if (statement.kind !== "insert" || !statement.table) continue;
		if (!NEEDED_TABLES.has(statement.table)) continue;

		const parsed = parseInsert(statement.text);
		if (!parsed) continue;

		const existing = tables.get(parsed.table);
		if (existing) {
			existing.rows.push(...parsed.rows);
			continue;
		}

		tables.set(parsed.table, {
			columns: parsed.columns,
			rows: [...parsed.rows],
		});
	}

	return tables;
}

function rowsOf(
	tables: Tables,
	name: string,
	limit: number | null = null,
): LegacyRecord[] {
	const table = tables.get(name);
	if (!table) return [];

	const rows = limit ? table.rows.slice(0, limit) : table.rows;
	return rows.map((row) => toRecord(table.columns, row));
}

async function buildLookups(
	tables: Tables,
	options: Options,
): Promise<Lookups> {
	const countries = new Map<
		string,
		{ name: string | null; iso3166: string | null }
	>();

	for (const record of rowsOf(tables, "countries")) {
		const id = clean(record.id);
		if (!id) continue;
		countries.set(id, {
			name: clean(record.name),
			iso3166: clean(record.iso3166),
		});
	}

	return {
		countries,
		statuses: nameIndex(tables, "statuses"),
		lists: nameIndex(tables, "lists"),
		phoneTypes: nameIndex(tables, "phone_types"),
		owners: await resolveOwners(tables, options),
	};
}

function nameIndex(tables: Tables, name: string): Map<string, string> {
	const index = new Map<string, string>();

	for (const record of rowsOf(tables, name)) {
		const id = clean(record.id);
		const value = clean(record.name);
		if (id && value) index.set(id, value);
	}

	return index;
}

async function resolveOwners(
	tables: Tables,
	options: Options,
): Promise<Map<string, string>> {
	const owners = new Map<string, string>();
	if (options.dryRun) return owners;

	const users = await db.user.findMany({
		select: { id: true, email: true, name: true },
	});

	const byEmail = new Map<string, string>();
	const byName = new Map<string, string>();

	for (const user of users) {
		if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
		if (user.name) byName.set(user.name.toLowerCase(), user.id);
	}

	for (const record of rowsOf(tables, "users")) {
		const id = clean(record.id);
		const username = clean(record.username)?.toLowerCase();
		if (!id || !username) continue;

		const match = byEmail.get(username) ?? byName.get(username);
		if (match) owners.set(id, match);
	}

	return owners;
}

async function mappedId(
	legacyTable: string,
	legacyId: string,
): Promise<string | null> {
	const mapping = await db.legacyImportMapping.findUnique({
		where: { legacyTable_legacyId: { legacyTable, legacyId } },
		select: { crmId: true },
	});

	return mapping?.crmId ?? null;
}

async function markMapped(
	legacyTable: string,
	legacyId: string,
	model: LegacyImportModel,
	crmId: string,
): Promise<void> {
	await db.legacyImportMapping.create({
		data: { legacyTable, legacyId, model, crmId },
	});
}

async function importCompanies(
	tables: Tables,
	lookups: Lookups,
	summary: Summary,
	options: Options,
): Promise<Map<string, string>> {
	const byLegacyId = new Map<string, string>();

	for (const record of rowsOf(tables, "companies")) {
		if (record.is_active !== "1") continue;
		if (record.company_type !== "company") continue;

		const legacyId = clean(record.id);
		const name = clean(record.name);
		if (!legacyId || !name || name.startsWith("--")) continue;

		const mapped = await mappedId("companies", legacyId);
		if (mapped) {
			byLegacyId.set(legacyId, mapped);
			summary.skipped += 1;
			continue;
		}

		const carried = await db.company.findUnique({
			where: { id: legacyCompanyId(legacyId) },
			select: { id: true },
		});

		if (carried) {
			if (!options.dryRun) {
				await markMapped(
					"companies",
					legacyId,
					LegacyImportModel.Company,
					carried.id,
				);
			}
			byLegacyId.set(legacyId, carried.id);
			summary.deduped += 1;
			continue;
		}

		if (options.dryRun) {
			byLegacyId.set(legacyId, legacyId);
			summary.companies += 1;
			continue;
		}

		const country = lookups.countries.get(clean(record.id_country) ?? "");
		const domain =
			domainFrom(clean(record.site_url)) ??
			domainFromEmail(clean(record.email));

		const existing = domain
			? await db.company.findUnique({ where: { domain }, select: { id: true } })
			: null;

		if (existing) {
			await markMapped(
				"companies",
				legacyId,
				LegacyImportModel.Company,
				existing.id,
			);
			byLegacyId.set(legacyId, existing.id);
			summary.deduped += 1;
			continue;
		}

		const created = await db.company.create({
			data: {
				name,
				domain,
				website: clean(record.site_url),
				email: clean(record.email),
				phone: clean(record.phone),
				streetAddress: clean(record.address),
				country: country?.name ?? null,
				countryCode: country?.iso3166 ?? null,
				source: RecordSource.IMPORT,
			},
			select: { id: true },
		});

		await markMapped(
			"companies",
			legacyId,
			LegacyImportModel.Company,
			created.id,
		);
		byLegacyId.set(legacyId, created.id);
		summary.companies += 1;
	}

	return byLegacyId;
}

async function importContacts(
	tables: Tables,
	lookups: Lookups,
	companiesByLegacyId: Map<string, string>,
	summary: Summary,
	options: Options,
): Promise<Map<string, string>> {
	const byLegacyId = new Map<string, string>();

	for (const record of rowsOf(tables, "clients", options.limit)) {
		const legacyId = clean(record.id);
		if (!legacyId) continue;

		const mapped = await mappedId("clients", legacyId);
		if (mapped) {
			byLegacyId.set(legacyId, mapped);
			summary.skipped += 1;
			continue;
		}

		const split = splitName(record.name);
		if (!split) {
			summary.skipped += 1;
			continue;
		}

		const title = jobTitle(record.title);
		if (clean(record.title) && !title) summary.honorificTitles += 1;

		const carried = await db.contact.findUnique({
			where: { id: legacyContactId(legacyId) },
			select: { id: true },
		});

		if (carried) {
			if (!options.dryRun) {
				await markMapped(
					"clients",
					legacyId,
					LegacyImportModel.Contact,
					carried.id,
				);
			}
			byLegacyId.set(legacyId, carried.id);
			summary.deduped += 1;
			continue;
		}

		if (options.dryRun) {
			byLegacyId.set(legacyId, legacyId);
			summary.contacts += 1;
			continue;
		}

		const country = lookups.countries.get(clean(record.id_country) ?? "");
		const created = await db.contact.create({
			data: {
				firstName: split.firstName,
				lastName: split.lastName,
				title,
				streetAddress: clean(record.address),
				country: country?.name ?? null,
				countryCode: country?.iso3166 ?? null,
				companyId:
					companiesByLegacyId.get(clean(record.id_company) ?? "") ?? null,
				ownerId: lookups.owners.get(clean(record.id_user_agent) ?? "") ?? null,
				source: RecordSource.IMPORT,
				verificationStatus: ContactVerificationStatus.UNVERIFIED,
			},
			select: { id: true },
		});

		await markMapped(
			"clients",
			legacyId,
			LegacyImportModel.Contact,
			created.id,
		);
		byLegacyId.set(legacyId, created.id);
		summary.contacts += 1;
	}

	return byLegacyId;
}

async function importMethods(
	tables: Tables,
	lookups: Lookups,
	contactsByLegacyId: Map<string, string>,
	summary: Summary,
	options: Options,
): Promise<void> {
	const byClient = new Map<string, LegacyRecord[]>();

	for (const record of rowsOf(tables, "client_contacts")) {
		if (record.is_active !== "1") continue;

		const clientId = clean(record.id_client);
		if (!clientId) continue;

		const list = byClient.get(clientId);
		if (list) list.push(record);
		else byClient.set(clientId, [record]);
	}

	const rows = options.dryRun
		? []
		: await db.contact.findMany({
				select: { id: true, email: true, phone: true },
			});

	const emailOwners = new Map<string, string>();
	const primaryEmail = new Set<string>();
	const primaryPhone = new Set<string>();

	for (const row of rows) {
		if (row.email) {
			emailOwners.set(row.email.toLowerCase(), row.id);
			primaryEmail.add(row.id);
		}
		if (row.phone) primaryPhone.add(row.id);
	}

	for (const [clientId, records] of byClient) {
		const contactId = contactsByLegacyId.get(clientId);
		if (!contactId) {
			summary.lookupMisses += 1;
			continue;
		}

		for (const record of records) {
			const legacyId = clean(record.id);
			if (legacyId && (await mappedId("client_contacts", legacyId))) {
				summary.skipped += 1;
				continue;
			}

			const value = clean(record.contact);
			if (!value) continue;

			if (record.contact_type === "email") {
				if (!isEmail(value)) continue;

				const owner = emailOwners.get(value.toLowerCase()) ?? contactId;
				emailOwners.set(value.toLowerCase(), owner);

				await writeMethod({
					owner,
					kind: ContactMethodKind.EMAIL,
					value,
					label: null,
					legacyId,
					hasPrimary: primaryEmail,
					summary,
					options,
				});
				continue;
			}

			const e164 = toE164(value);
			if (!e164) {
				summary.e164Failed += 1;
				continue;
			}

			await writeMethod({
				owner: contactId,
				kind: ContactMethodKind.PHONE,
				value: e164,
				label:
					lookups.phoneTypes.get(clean(record.id_phone_type) ?? "") ?? null,
				legacyId,
				hasPrimary: primaryPhone,
				summary,
				options,
			});
		}
	}
}

async function writeMethod(input: {
	owner: string;
	kind: ContactMethodKind;
	value: string;
	label: string | null;
	legacyId: string | null;
	hasPrimary: Set<string>;
	summary: Summary;
	options: Options;
}): Promise<void> {
	if (input.options.dryRun) {
		input.summary.methods += 1;
		return;
	}

	const method = await db.contactMethod.upsert({
		where: {
			contactId_kind_value: {
				contactId: input.owner,
				kind: input.kind,
				value: input.value,
			},
		},
		create: {
			contactId: input.owner,
			kind: input.kind,
			value: input.value,
			label: input.label,
		},
		update: { label: input.label },
		select: { id: true },
	});

	if (!input.hasPrimary.has(input.owner)) {
		input.hasPrimary.add(input.owner);
		const data =
			input.kind === ContactMethodKind.EMAIL
				? { email: input.value }
				: { phone: input.value };
		await db.contact.update({ where: { id: input.owner }, data });
	}

	if (input.legacyId) {
		await markMapped(
			"client_contacts",
			input.legacyId,
			LegacyImportModel.ContactMethod,
			method.id,
		);
	}

	input.summary.methods += 1;
}

async function importActivities(
	tables: Tables,
	contactsByLegacyId: Map<string, string>,
	companiesByLegacyId: Map<string, string>,
	summary: Summary,
	options: Options,
): Promise<void> {
	const userId = options.userId;

	for (const record of rowsOf(tables, "clients", options.limit)) {
		const legacyId = clean(record.id);
		if (!legacyId) continue;

		const contactId = contactsByLegacyId.get(legacyId);
		if (!contactId) continue;

		if (await mappedId("clients_note", legacyId)) {
			summary.skipped += 1;
			continue;
		}

		const body = capNote(record.notes);
		if (!body) continue;

		if (options.dryRun) {
			summary.activities += 1;
			continue;
		}

		if (!userId) continue;

		const created = await db.activity.create({
			data: {
				type: "NOTE",
				subject: "Imported from legacy CRM",
				body,
				occurredAt: toDate(clean(record.created_at)),
				contactId,
				companyId:
					companiesByLegacyId.get(clean(record.id_company) ?? "") ?? null,
				createdById: userId,
				meta: { import: "wamp", legacyTable: "clients", legacyId },
			},
			select: { id: true },
		});

		await markMapped(
			"clients_note",
			legacyId,
			LegacyImportModel.Activity,
			created.id,
		);
		summary.activities += 1;
	}
}

async function enqueueVerification(
	contactsByLegacyId: Map<string, string>,
	summary: Summary,
	options: Options,
): Promise<void> {
	const ids = [...new Set(contactsByLegacyId.values())];
	summary.verifyContacts = ids.length;

	if (options.dryRun || ids.length === 0) return;

	const trigger = new AgentTriggerService(db);

	for (const chunk of chunkArray(ids, VERIFY_CHUNK)) {
		const result = await trigger.backfill({
			kind: "verify",
			reason: "imported from legacy WAMP CRM",
			contactIds: chunk,
			budget: 4,
			priority: PRIORITY.verify,
		});

		summary.verifyQueued += result.queued;
		summary.verifyAlreadyQueued += result.alreadyQueued;
	}
}

function report(summary: Summary, options: Options): void {
	const lines = [
		`${options.dryRun ? "Dry run" : "Import"} complete`,
		`  companies:                ${summary.companies}`,
		`  contacts:                 ${summary.contacts}`,
		`  contact methods:          ${summary.methods}`,
		`  activities:               ${summary.activities}`,
		`  deduped onto existing:    ${summary.deduped}`,
		`  skipped (already mapped): ${summary.skipped}`,
		`  lookup misses:            ${summary.lookupMisses}`,
		`  E.164 failures:           ${summary.e164Failed}`,
		`  honorific titles dropped: ${summary.honorificTitles}`,
		`  verify contacts:          ${summary.verifyContacts}`,
		`  verify queued:            ${summary.verifyQueued} (already queued ${summary.verifyAlreadyQueued})`,
	];

	console.log(lines.join("\n"));
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
