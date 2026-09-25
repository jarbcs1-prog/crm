export { dedup, sessionHash } from "./dedup.js";
export { hasPii, scrubPii, scrubSession } from "./pii.js";

import { dedup } from "./dedup.js";
import type { PiiOptions } from "./pii.js";
import { scrubSession } from "./pii.js";
import type { Session } from "./schema.js";

export interface FilterOptions {
  pii?: PiiOptions;
}

export function filterPipeline(sessions: Session[], opts: FilterOptions = {}): { sessions: Session[]; stats: { duplicates: number; piiRedacted: number; piiDropped: number } } {
  let piiRedacted = 0;
  let piiDropped = 0;
  const scrubbed: Session[] = [];
  for (const s of sessions) {
    const r = scrubSession(s as Session & { turns: Array<{ content: string; reasoning_content?: string }> }, opts.pii);
    if (r === null) {
      piiDropped++;
      continue;
    }
    if (r.redacted) piiRedacted++;
    scrubbed.push(r.session as Session);
  }
  const { unique, duplicates } = dedup(scrubbed);
  return { sessions: unique, stats: { duplicates, piiRedacted, piiDropped } };
}
