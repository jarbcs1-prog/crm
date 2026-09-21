import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	capNote,
	clean,
	domainFrom,
	domainFromEmail,
	isEmail,
	jobTitle,
	MAX_NOTE_LENGTH,
	splitName,
	toDate,
	toE164,
	toRecord,
} from "../src/import/legacy-map";
import { parseInsert, readStatements } from "../src/import/sql-scanner";
import { chunkArray, parseArgs } from "../src/import/import-wamp";

const FIXTURE = fileURLToPath(
	new URL("./fixtures/wamp-fixture.sql", import.meta.url),
);

async function statements() {
	const collected: { kind: string; table: string | null; text: string }[] = [];
	for await (const statement of readStatements(FIXTURE)) {
		collected.push(statement);
	}
	return collected;
}

describe("readStatements", () => {
	it("classifies create and insert statements", async () => {
		const found = await statements();

		const creates = found.filter((statement) => statement.kind === "create");
		const inserts = found.filter((statement) => statement.kind === "insert");

		expect(creates.map((statement) => statement.table).toSorted()).toEqual([
			"client_audit",
			"client_contacts",
			"clients",
			"companies",
			"countries",
			"lists",
			"phone_types",
			"statuses",
			"users",
		]);
		expect(inserts.length).toBe(9);
	});

	it("does not end a statement on a semicolon inside a comment or a string", async () => {
		const clients = (await statements()).find(
			(statement) =>
				statement.kind === "insert" && statement.table === "clients",
		);

		expect(clients).toBeDefined();
		expect(clients?.text).toContain("second; line with a semicolon");
		expect(clients?.text).not.toContain("a block comment");
	});
});

describe("parseInsert", () => {
	it("reads the column list and every tuple", async () => {
		const clients = (await statements()).find(
			(statement) =>
				statement.kind === "insert" && statement.table === "clients",
		);

		const parsed = parseInsert(clients?.text ?? "");
		expect(parsed?.table).toBe("clients");
		expect(parsed?.columns).toContain("name");
		expect(parsed?.rows.length).toBe(3);
		expect(parsed?.rows[0]?.length).toBe(parsed?.columns.length);
	});

	it("distinguishes NULL from an empty string", async () => {
		const clients = (await statements()).find(
			(statement) =>
				statement.kind === "insert" && statement.table === "clients",
		);

		const parsed = parseInsert(clients?.text ?? "");
		const row = toRecord(parsed?.columns ?? [], parsed?.rows[1] ?? []);

		expect(row.address).toBeNull();
		expect(row.notes).toBeNull();

		const third = toRecord(parsed?.columns ?? [], parsed?.rows[2] ?? []);
		expect(third.address).toBe("");
	});

	it("unescapes doubled and backslash quotes and keeps escapes intact", async () => {
		const clients = (await statements()).find(
			(statement) =>
				statement.kind === "insert" && statement.table === "clients",
		);

		const parsed = parseInsert(clients?.text ?? "");
		const first = toRecord(parsed?.columns ?? [], parsed?.rows[0] ?? []);
		const third = toRecord(parsed?.columns ?? [], parsed?.rows[2] ?? []);

		expect(first.notes).toContain("it's here");
		expect(first.notes).toContain("\r\n");
		expect(first.notes).toContain("second; line with a semicolon");
		expect(third.notes).toContain("escaped ' quote and a backslash \\ here");
	});

	it("returns null for a statement that is not an insert", () => {
		expect(parseInsert("CREATE TABLE `x` (`id` int)")).toBeNull();
		expect(parseInsert("")).toBeNull();
	});

	it("warns without crashing on a malformed tuple", () => {
		const parsed = parseInsert(
			"INSERT INTO `clients` (`id`, `name`) VALUES (1, 'unterminated",
		);

		expect(parsed?.rows.length).toBe(1);
		expect(parsed?.rows[0]?.[0]).toBe("1");
		expect(parsed?.rows[0]?.[1]).toBe("unterminated");
	});
});

describe("legacy mappers", () => {
	it("splits a legacy name into first and last", () => {
		expect(splitName("John Hall")).toEqual({
			firstName: "John",
			lastName: "Hall",
		});
		expect(splitName("Phillip Wai-shing Ng")).toEqual({
			firstName: "Phillip",
			lastName: "Wai-shing Ng",
		});
		expect(splitName("S Y")).toEqual({ firstName: "S", lastName: "Y" });
		expect(splitName("   ")).toBeNull();
	});

	it("refuses to store an honorific as a job title", () => {
		expect(jobTitle("Mr.")).toBeNull();
		expect(jobTitle("MS")).toBeNull();
		expect(jobTitle("DATO")).toBeNull();
		expect(jobTitle("-")).toBeNull();
		expect(jobTitle("")).toBeNull();
		expect(jobTitle("Compliance Officer")).toBe("Compliance Officer");
	});

	it("canonicalises phone digits to E.164 and rejects what it cannot", () => {
		expect(toE164("461234567")).toBe("+461234567");
		expect(toE164("441442827727")).toBe("+441442827727");
		expect(toE164("00351598765432")).toBe("+351598765432");
		expect(toE164("bad-number")).toBeNull();
		expect(toE164("123")).toBeNull();
		expect(toE164("00000000000")).toBeNull();
		expect(toE164(null)).toBeNull();
	});

	it("derives a bare domain from a url or an email and rejects junk", () => {
		expect(domainFrom("http://www.northwind.com/")).toBe("northwind.com");
		expect(domainFrom("https://acme.co.uk")).toBe("acme.co.uk");
		expect(domainFrom("OFFICE1")).toBeNull();
		expect(domainFrom("[")).toBeNull();
		expect(domainFrom(null)).toBeNull();
		expect(domainFromEmail("tokonkwo@northwind.com")).toBe("northwind.com");
		expect(domainFromEmail("info")).toBeNull();
		expect(domainFromEmail(null)).toBeNull();
	});

	it("rejects a zero date rather than inventing one", () => {
		expect(toDate("2006-04-30 16:56:04")?.toISOString()).toBe(
			"2006-04-30T16:56:04.000Z",
		);
		expect(toDate("0000-00-00 00:00:00")).toBeNull();
		expect(toDate("")).toBeNull();
		expect(toDate(null)).toBeNull();
	});

	it("strips NUL bytes and blank values", () => {
		expect(clean("  hello  ")).toBe("hello");
		expect(clean(`${String.fromCharCode(0)}abc`)).toBe("abc");
		expect(clean("   ")).toBeNull();
		expect(clean(undefined)).toBeNull();
	});

	it("recognises an email and caps a diary note", () => {
		expect(isEmail("a@b.com")).toBe(true);
		expect(isEmail("not-an-email")).toBe(false);
		expect(isEmail(null)).toBe(false);

		const long = "x".repeat(MAX_NOTE_LENGTH + 25);
		expect(capNote(long)?.length).toBe(MAX_NOTE_LENGTH);
		expect(capNote("short")?.length).toBe(5);
		expect(capNote(null)).toBeNull();
	});
});

describe("import batching", () => {
	it("parses limit and batch size", () => {
		expect(parseArgs(["--limit", "10"]).limit).toBe(10);
		expect(parseArgs([]).batchSize).toBe(100);
		expect(parseArgs(["--batchSize", "25"]).batchSize).toBe(25);
	});

	it("splits ids into bounded chunks", () => {
		expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunkArray([], 10)).toEqual([]);
	});
});
