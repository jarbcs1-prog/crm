import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PitchChunk } from "./pitch-rag.js";

const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));

export const COLLATERAL_DIR = join(DATA_DIR, "collateral");

export type LayoutCellKind = "text" | "table" | "figure";

export type LayoutCell = {
	kind: LayoutCellKind;
	text: string;
	rows?: number;
};

export type LayoutPage = {
	page: number;
	cells: LayoutCell[];
};

export type LayoutDocument = {
	document: string;
	title: string;
	pages: LayoutPage[];
};

function isTableRow(line: string): boolean {
	return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function figureOf(block: string): LayoutCell | undefined {
	const match = block.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
	if (!match) return undefined;
	const alt = (match[1] ?? "").trim();
	const src = (match[2] ?? "").trim();
	return { kind: "figure", text: alt ? `${alt} (${src})` : src };
}

function cellsFromPage(pageText: string): LayoutCell[] {
	const cells: LayoutCell[] = [];
	const blocks = pageText.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 0);
	for (const block of blocks) {
		const figure = figureOf(block);
		if (figure) {
			cells.push(figure);
			continue;
		}
		const lines = block.split("\n");
		const first = lines[0];
		if (lines.length > 1 && first !== undefined && lines.every(isTableRow)) {
			const header = first.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean).join(" | ");
			cells.push({ kind: "table", text: header, rows: lines.length - 2 > 0 ? lines.length - 2 : 0 });
			continue;
		}
		cells.push({ kind: "text", text: block });
	}
	return cells;
}

function titleOf(markdown: string, stem: string): string {
	for (const line of markdown.split("\n")) {
		const match = line.match(/^#{1,3}\s+(.+)$/);
		if (match?.[1]?.trim()) return match[1].trim();
	}
	return stem;
}

export function parseMarkdownCollateral(markdown: string, stem: string): LayoutDocument {
	const rawPages = markdown.split(/\n---+\n/).map((p) => p.trim()).filter((p) => p.length > 0);
	const pages: LayoutPage[] = (rawPages.length > 0 ? rawPages : []).map((pageText, index) => ({
		page: index + 1,
		cells: cellsFromPage(pageText),
	}));
	return { document: stem, title: titleOf(markdown, stem), pages };
}

export type LayoutJsonlRow = {
	document: string;
	page: number;
	cell: number;
	kind: LayoutCellKind;
	text: string;
	rows?: number;
};

export function toJsonlRows(doc: LayoutDocument): LayoutJsonlRow[] {
	const rows: LayoutJsonlRow[] = [];
	for (const page of doc.pages) {
		page.cells.forEach((cell, index) => {
			rows.push({
				document: doc.document,
				page: page.page,
				cell: index + 1,
				kind: cell.kind,
				text: cell.text,
				...(cell.rows !== undefined ? { rows: cell.rows } : {}),
			});
		});
	}
	return rows;
}

export function toPitchChunks(doc: LayoutDocument): PitchChunk[] {
	return toJsonlRows(doc).map((row) => ({
		id: `collateral:${doc.document}#page-${row.page}-cell-${row.cell}`,
		source: "pitch" as const,
		pitch: `collateral-${doc.document}`,
		segment: `page-${row.page}-cell-${row.cell}`,
		title: `${doc.title} (${row.kind})`,
		text: row.text,
	}));
}

export async function chunksFromCollateral(dir: string = COLLATERAL_DIR): Promise<PitchChunk[]> {
	let names: string[];
	try {
		names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith(".md")).sort();
	} catch {
		return [];
	}
	const chunks: PitchChunk[] = [];
	for (const name of names) {
		const stem = basename(name, ".md");
		let markdown: string;
		try {
			markdown = await readFile(join(dir, name), "utf8");
		} catch {
			continue;
		}
		for (const chunk of toPitchChunks(parseMarkdownCollateral(markdown, stem))) chunks.push(chunk);
	}
	return chunks;
}
