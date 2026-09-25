export type PiiMode = "replacement" | "lossy";

export interface PiiOptions {
  mode?: PiiMode;
  placeholder?: string;
}

const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /sk-[a-zA-Z0-9_-]{20,}/g, replace: "<REDACTED>" },
  { re: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replace: "<REDACTED>" },
  { re: /ghp_[a-zA-Z0-9]{36,}/g, replace: "<REDACTED>" },
  { re: /gho_[a-zA-Z0-9]{36,}/g, replace: "<REDACTED>" },
  { re: /AKIA[0-9A-Z]{16}/g, replace: "<REDACTED>" },
  { re: /xox[bpras]-[0-9A-Za-z-]+/g, replace: "<REDACTED>" },
  { re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, replace: "<REDACTED>" },
  { re: /Bearer\s+[a-zA-Z0-9._~+\/=-]{20,}/gi, replace: "Bearer <REDACTED>" },
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replace: "<REDACTED>" },
  { re: /C:\\Users\\[^\\\s"']+(?:\\[^\\\s"']+)*/g, replace: "<REDACTED>" },
  { re: /\/home\/[^\/\s"']+(?:\/[^\/\s"']+)*/g, replace: "<REDACTED>" },
  { re: /(?:api[_-]?key|apikey|secret|password|passwd|access_?token)\s*[:=]\s*["']?[^"'\s,}]+["']?/gi, replace: "<REDACTED>" },
];

export function scrubPii(text: string, opts: PiiOptions = {}): string {
  const placeholder = opts.placeholder ?? "<REDACTED>";
  let out = text;
  for (const p of PATTERNS) {
    out = out.replace(p.re, p.replace.includes("<REDACTED>") ? p.replace.replace("<REDACTED>", placeholder) : p.replace);
  }
  return out;
}

export function hasPii(text: string): boolean {
  return PATTERNS.some((p) => {
    p.re.lastIndex = 0;
    return p.re.test(text);
  });
}

export function scrubSession<T extends { turns: Array<{ content: string; reasoning_content?: string }> }>(
  session: T,
  opts: PiiOptions = {},
): { session: T; redacted: boolean } | null {
  let redacted = false;
  const scrub = (s: string) => {
    const n = scrubPii(s, opts);
    if (n !== s) redacted = true;
    return n;
  };

  if (opts.mode === "lossy" && hasPii(JSON.stringify(session))) {
    return null;
  }

  const copy = structuredClone(session) as T;
  for (const t of copy.turns) {
    t.content = scrub(t.content);
    if (t.reasoning_content) t.reasoning_content = scrub(t.reasoning_content);
  }
  return { session: copy, redacted };
}
