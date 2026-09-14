/**
 * Egress guard for third-party research queries.
 *
 * `data-boundaries.md` rule 1 forbids sending customer text (message bodies,
 * quotes, forwarded threads) to a third party. That rule is enforced in the
 * prompt, but the prompt is not a hard boundary: an attacker who places text
 * into a mailbox the agent reads (prompt injection) can try to make the agent
 * paste it into a `research_person` question. This guard is the code-level
 * backstop — it refuses queries that look like they contain mailbox or
 * message-derived content before anything leaves the process.
 *
 * It is deliberately conservative: it targets *message structure* (email
 * headers, forwarded markers, quoted reply blocks), not names or email
 * addresses, so legitimate derived questions ("What has Acme announced in
 * 2026?") are unaffected.
 */

const EMAIL_HEADER = /^\s*(from|to|cc|bcc|subject|date|sent|received)\s*:/im;

const FORWARDED_MARKER =
	/(-----Original Message-----|----------\s*Forwarded message\s*----------)/i;

const FORWARDED_ATTRIBUTION = /on\s+.{3,60}?\s+wrote:/i;

const QUOTED_LINE = /^\s*>/;

export function looksLikeMessageContent(text: string): boolean {
	if (!text || text.length < 20) return false;

	if (FORWARDED_MARKER.test(text)) return true;
	if (FORWARDED_ATTRIBUTION.test(text)) return true;

	const lines = text.split(/\r?\n/);

	let headerHits = 0;
	let quotedLines = 0;
	for (const line of lines) {
		if (EMAIL_HEADER.test(line)) headerHits += 1;
		if (QUOTED_LINE.test(line)) quotedLines += 1;
	}

	if (headerHits >= 2) return true;
	if (quotedLines >= 3) return true;

	return false;
}

export function guardThirdPartyQuery(
	text: string,
): { ok: true } | { ok: false; reason: string } {
	if (looksLikeMessageContent(text)) {
		return {
			ok: false,
			reason:
				"That query looks like it contains message or mailbox content. The data-boundary rules forbid sending customer text to a third party — ask a derived question about the public fact instead (e.g. 'What has Acme announced in 2026?').",
		};
	}

	return { ok: true };
}
