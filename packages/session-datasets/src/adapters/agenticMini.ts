import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chunkSession } from "../chunk.js";
import {
	type AgenticMiniRecord,
	type Session,
	toAgenticMini,
} from "../schema.js";

function ensureToolCallId(
	id: string | undefined,
	sessionId: string,
	idx: number,
): string {
	if (id) return id;
	return `call_${createHash("sha256").update(`${sessionId}:${idx}`).digest("hex").slice(0, 24)}`;
}

export function sessionToRecords(session: Session): AgenticMiniRecord[] {
	const chunks = chunkSession(session);
	return chunks.map((chunk, ci) => {
		const chunkSessionObj: Session = { ...session, turns: chunk.turns };
		const record = toAgenticMini(chunkSessionObj, ci, chunks.length);
		let tcIdx = 0;
		for (const m of record.messages) {
			if (m.tool_calls) {
				for (const tc of m.tool_calls) {
					tc.id = ensureToolCallId(tc.id, session.id, tcIdx++);
					if (!tc.function.arguments) tc.function.arguments = "{}";
					else {
						try {
							JSON.stringify(JSON.parse(tc.function.arguments));
						} catch {
							tc.function.arguments = JSON.stringify(tc.function.arguments);
						}
					}
				}
			}
		}
		return record;
	});
}

export function sessionsToRecords(sessions: Session[]): AgenticMiniRecord[] {
	return sessions.flatMap(sessionToRecords);
}

export async function writeJsonl(
	records: AgenticMiniRecord[],
	outPath: string,
): Promise<void> {
	await mkdir(dirname(outPath), { recursive: true });
	const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
	await writeFile(outPath, content, "utf-8");
}

export async function writeParquet(
	records: AgenticMiniRecord[],
	outPath: string,
): Promise<void> {
	await mkdir(dirname(outPath), { recursive: true });
	try {
		await import("parquetjs-lite" as string);
	} catch {}
	try {
		const h = await import("hyparquet" as string);
		void h;
	} catch {}
	const jsonlPath = outPath.replace(/\.parquet$/i, ".jsonl");
	const helper = join(dirname(outPath), "_to_parquet.py");
	const pyJsonl = jsonlPath.replace(/\\/g, "/");
	const pyOut = outPath.replace(/\\/g, "/");
	await writeFile(
		helper,
		`import json,sys\ntry:\n import pyarrow as pa, pyarrow.parquet as pq\nexcept ImportError:\n print("pyarrow not installed; JSONL at ${pyJsonl} is Parquet-ready",file=sys.stderr);sys.exit(0)\nimport pathlib\nsrc=pathlib.Path(r"${pyJsonl}")\ndst=pathlib.Path(r"${pyOut}")\nrecs=[json.loads(l) for l in src.read_text().splitlines() if l.strip()]\ntable=pa.Table.from_pylist([{"messages": json.dumps(r["messages"]), "metadata": json.dumps(r["metadata"])} for r in recs])\npq.write_table(table,str(dst))\nprint(f"Wrote {len(recs)} rows to {dst}")\n`,
	);
	try {
		const { spawnSync } = await import("node:child_process");
		const res = spawnSync("python", [helper], {
			encoding: "utf-8",
			timeout: 30000,
		});
		if (res.stdout) process.stdout.write(res.stdout);
		if (res.stderr) process.stderr.write(res.stderr);
	} catch {}
}

export async function buildAgenticMini(
	inputPath: string,
	outPath: string,
): Promise<void> {
	const raw = await readFile(inputPath, "utf-8");
	const sessions: Session[] = raw
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const records = sessionsToRecords(sessions);
	if (outPath.endsWith(".parquet")) await writeParquet(records, outPath);
	else await writeJsonl(records, outPath);
}

const isMain =
	process.argv[1]?.replace(/\\/g, "/").endsWith("adapters/agenticMini.ts") ||
	process.argv[1]?.endsWith("agenticMini.js");
if (isMain) {
	const input = process.argv[2] ?? "data/canonical.jsonl";
	const output = process.argv[3] ?? "data/agentic-mini.jsonl";
	buildAgenticMini(input, output)
		.then(() => console.log(`agentic-mini: ${input} -> ${output}`))
		.catch((e) => {
			console.error(e);
			process.exit(1);
		});
}
