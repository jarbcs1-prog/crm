import type { Session, Turn } from "./schema.js";

export interface ChunkMeta {
  session_id: string;
  source: string;
  chunk_index: number;
  chunk_total: number;
  overlap_from: number | null;
}

export interface Chunk {
  turns: Turn[];
  meta: ChunkMeta;
}

const MAX_TURNS = 10;
const OVERLAP = 2;

function isToolAdjacencyBreak(turns: Turn[], idx: number): boolean {
  if (idx <= 0 || idx >= turns.length) return false;
  const prev = turns[idx - 1]!;
  const cur = turns[idx]!;
  if (prev.role === "assistant" && (prev.tool_calls?.length ?? 0) > 0 && cur.role === "tool") return true;
  return false;
}

function expandStartForAdjacency(turns: Turn[], start: number): number {
  if (start <= 0 || start >= turns.length) return start;
  if (turns[start]!.role === "tool") {
    let blockStart = start;
    while (blockStart > 0 && turns[blockStart - 1]!.role === "tool") blockStart--;
    if (blockStart > 0 && turns[blockStart - 1]!.role === "assistant" && (turns[blockStart - 1]!.tool_calls?.length ?? 0) > 0) {
      return blockStart - 1;
    }
  }
  while (start > 0 && isToolAdjacencyBreak(turns, start)) start--;
  return start;
}

function toolBlockEnd(turns: Turn[], idx: number): number {
  let end = idx;
  while (end < turns.length && turns[end]!.role === "tool") end++;
  return end;
}

function expandEndForAdjacency(turns: Turn[], end: number): number {
  if (end <= 0 || end >= turns.length) return Math.min(end, turns.length);
  if (turns[end]!.role === "tool") {
    let blockStart = end;
    while (blockStart > 0 && turns[blockStart - 1]!.role === "tool") blockStart--;
    if (blockStart > 0 && turns[blockStart - 1]!.role === "assistant" && (turns[blockStart - 1]!.tool_calls?.length ?? 0) > 0) {
      return toolBlockEnd(turns, end);
    }
  }
  if (end > 0 && turns[end - 1]!.role === "assistant" && (turns[end - 1]!.tool_calls?.length ?? 0) > 0 && turns[end]!.role === "tool") {
    return toolBlockEnd(turns, end);
  }
  return Math.min(end, turns.length);
}

export function chunkSession(session: Session): Chunk[] {
  const turns = session.turns;
  if (turns.length === 0) return [];
  if (turns.length <= MAX_TURNS) {
    const safeEnd = expandEndForAdjacency(turns, turns.length);
    return [{ turns: turns.slice(0, safeEnd), meta: { session_id: session.id, source: session.meta.source, chunk_index: 0, chunk_total: 1, overlap_from: null } }];
  }
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < turns.length) {
    let end = Math.min(start + MAX_TURNS, turns.length);
    end = expandEndForAdjacency(turns, end);
    if (end - start > MAX_TURNS) {
      end = start + MAX_TURNS;
      if (end < turns.length && turns[end]!.role === "tool") {
        let blockStart = end;
        while (blockStart > start && turns[blockStart - 1]!.role === "tool") blockStart--;
        if (blockStart > start && turns[blockStart - 1]!.role === "assistant" && (turns[blockStart - 1]!.tool_calls?.length ?? 0) > 0) {
          end = blockStart - 1;
          if (end <= start) end = start + MAX_TURNS;
        }
      } else if (end > 0 && end < turns.length && isToolAdjacencyBreak(turns, end)) {
        end--;
      }
    }
    let slice = turns.slice(start, end);
    {
      const ids = new Set(slice.filter((t) => t.tool_calls?.length).flatMap((t) => t.tool_calls!.map((c) => c.id)));
      while (slice.length > 0 && slice[0]!.role === "tool" && !ids.has(slice[0]!.tool_call_id ?? "")) slice = slice.slice(1);
    }
    if (slice.length === 0) { start = end; continue; }
    chunks.push({ turns: slice, meta: { session_id: session.id, source: session.meta.source, chunk_index: chunks.length, chunk_total: 0, overlap_from: start > 0 ? OVERLAP : null } });
    if (end >= turns.length) break;
    let nextStart = end - OVERLAP;
    const rawNext = nextStart;
    nextStart = expandStartForAdjacency(turns, nextStart);
    if (nextStart >= end && nextStart === rawNext) nextStart = end - 1;
    if (nextStart <= start) nextStart = end - 1;
    while (nextStart > 0 && nextStart < turns.length && turns[nextStart]!.role === "tool") {
      let bs = nextStart;
      while (bs > 0 && turns[bs - 1]!.role === "tool") bs--;
      if (bs > 0 && turns[bs - 1]!.role === "assistant" && (turns[bs - 1]!.tool_calls?.length ?? 0) > 0 && bs - 1 < nextStart) {
        nextStart = bs - 1;
        break;
      }
      break;
    }
    start = Math.max(0, nextStart);
  }
  const total = chunks.length;
  for (const c of chunks) c.meta.chunk_total = total;
  return chunks;
}

export function chunkSessions(sessions: Session[]): Chunk[] {
  return sessions.flatMap(chunkSession);
}
