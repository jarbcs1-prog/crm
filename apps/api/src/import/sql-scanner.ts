import { createReadStream } from "node:fs";
import type { LegacyRow } from "./legacy-map";

export type Statement = {
	kind: "create" | "insert" | "other";
	table: string | null;
	text: string;
};

export type ParsedInsert = {
	table: string;
	columns: string[];
	rows: LegacyRow[];
};

const CREATE_TABLE = /^CREATE TABLE\s+`([^`]+)`/i;
const INSERT_INTO = /^INSERT INTO\s+`([^`]+)`/i;
const INSERT_HEAD = /^INSERT INTO\s+`([^`]+)`\s*\(([^)]*)\)\s*VALUES\s*/i;

const ESCAPES: Record<string, string> = {
	n: "\n",
	r: "\r",
	t: "\t",
	0: "\0",
	b: "\b",
	Z: "\u001a",
	"\\": "\\",
	"'": "'",
	'"': '"',
};

export async function* readStatements(path: string): AsyncGenerator<Statement> {
	let buffer = "";
	let quote: string | null = null;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;

	const stream = createReadStream(path, { encoding: "utf8" });

	for await (const chunk of stream as AsyncIterable<string>) {
		for (let index = 0; index < chunk.length; index += 1) {
			const char = chunk[index] as string;
			const next = chunk[index + 1];

			if (lineComment) {
				if (char === "\n") {
					lineComment = false;
					buffer += char;
				}
				continue;
			}

			if (blockComment) {
				if (char === "*" && next === "/") {
					blockComment = false;
					index += 1;
				}
				continue;
			}

			if (quote) {
				buffer += char;
				if (escaped) {
					escaped = false;
					continue;
				}
				if (char === "\\") {
					escaped = true;
					continue;
				}
				if (char === quote) {
					if (next === quote) {
						buffer += next;
						index += 1;
						continue;
					}
					quote = null;
				}
				continue;
			}

			if (char === "-" && next === "-") {
				lineComment = true;
				index += 1;
				continue;
			}

			if (char === "/" && next === "*") {
				blockComment = true;
				index += 1;
				continue;
			}

			if (char === "'" || char === '"' || char === "`") {
				quote = char;
				buffer += char;
				continue;
			}

			if (char === ";") {
				const text = buffer.trim();
				buffer = "";
				if (text) yield classify(text);
				continue;
			}

			buffer += char;
		}
	}

	const tail = buffer.trim();
	if (tail) yield classify(tail);
}

export function parseInsert(text: string): ParsedInsert | null {
	const head = INSERT_HEAD.exec(text);
	if (!head) return null;

	const table = head[1];
	if (!table) return null;

	const columns = (head[2] ?? "")
		.split(",")
		.map((column) => column.trim().replace(/^`|`$/g, ""))
		.filter(Boolean);

	return { table, columns, rows: parseTuples(text.slice(head[0].length)) };
}

function classify(text: string): Statement {
	const create = CREATE_TABLE.exec(text);
	if (create?.[1]) return { kind: "create", table: create[1], text };

	const insert = INSERT_INTO.exec(text);
	if (insert?.[1]) return { kind: "insert", table: insert[1], text };

	return { kind: "other", table: null, text };
}

function parseTuples(input: string): LegacyRow[] {
	const rows: LegacyRow[] = [];
	let index = 0;

	while (index < input.length) {
		while (index < input.length && input[index] !== "(") index += 1;
		if (index >= input.length) break;
		index += 1;

		const row: LegacyRow = [];
		let value = "";
		let quoted = false;
		let escaped = false;
		let started = false;
		let closed = false;

		while (index < input.length) {
			const char = input[index] as string;

			if (quoted) {
				if (escaped) {
					value += ESCAPES[char] ?? char;
					escaped = false;
					index += 1;
					continue;
				}
				if (char === "\\") {
					escaped = true;
					index += 1;
					continue;
				}
				if (char === "'") {
					if (input[index + 1] === "'") {
						value += "'";
						index += 2;
						continue;
					}
					quoted = false;
					index += 1;
					continue;
				}
				value += char;
				index += 1;
				continue;
			}

			if (char === "'") {
				quoted = true;
				started = true;
				index += 1;
				continue;
			}

			if (char === ",") {
				row.push(finish(value, started));
				value = "";
				started = false;
				index += 1;
				continue;
			}

			if (char === ")") {
				row.push(finish(value, started));
				closed = true;
				index += 1;
				break;
			}

			if (char === " " || char === "\n" || char === "\r" || char === "\t") {
				index += 1;
				continue;
			}

			value += char;
			started = true;
			index += 1;
		}

		if (!closed) row.push(finish(value, started));
		rows.push(row);
	}

	return rows;
}

function finish(value: string, started: boolean): string | null {
	if (!started) return null;
	if (value.trim().toUpperCase() === "NULL") return null;
	return value;
}
