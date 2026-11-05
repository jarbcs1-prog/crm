export type SimSegment = {
	id: string;
	text: string;
	listenAfter: boolean;
};

export type SimBranch = {
	id: string;
	trigger: string[];
	action: string;
	text: string;
};

export type SimTurn = {
	speaker: "agent" | "caller";
	text: string;
	segmentId?: string;
	branchId?: string;
};

export type SimPersona = {
	id: string;
	label: string;
	objective: string;
	script: string[];
	defaultReply: string;
};

export type SimResult = {
	turns: SimTurn[];
	terminalBranchId: string | undefined;
	terminalKind: "consent" | "refusal" | "script-end";
	clarifyUsed: boolean;
	clarifyTwice: boolean;
	consentGranted: boolean;
	documentRequestedWithoutConsent: boolean;
	segmentsSpoken: number;
};

export type SimCompliance = {
	check: string;
	pass: boolean;
	detail: string;
};

export type SimScores = {
	taskCompletion: number;
	efficiency: number;
	interest: number;
	motivation: number;
	urgency: number;
	experience: number;
	budget: number;
	compliance: SimCompliance[];
	pass: boolean;
};

const AFFIRM =
	/\b(yes|yeah|yep|sure|okay|ok|go ahead|sounds good|arrange|agreed|correct|that works)\b/i;

const DOC_REQUEST =
	/\b(send|provide|share|upload|forward|give|read out|confirm|tell me) .{0,40}?\b(documents?|statements?|accounts?|bank|financial|passport|records?|credentials?|funds?)\b/i;

const NEGATION =
	/(\bnot\b|\bnever\b|won't|don't|no .*?\b(need|ask|request|collect|provide)\b|without )/i;

function stripNegatedSentences(text: string): string {
	return text
		.split(/(?<=[.!?])\s+/)
		.filter((sentence) => !NEGATION.test(sentence))
		.join(" ");
}

export function requestsDocuments(text: string): boolean {
	return DOC_REQUEST.test(stripNegatedSentences(text));
}

function triggerMatches(reply: string, trigger: string): boolean {
	const cleanTrigger = trigger.replace(/\{[^{}\n]{1,64}\}/g, "").trim();
	if (cleanTrigger.length === 0) {
		return false;
	}
	const lower = reply.toLowerCase();
	const needle = cleanTrigger.toLowerCase();
	if (needle.length <= 3) {
		return new RegExp(
			`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
		).test(lower);
	}
	return lower.includes(needle);
}

function matchBranch(
	reply: string,
	branches: SimBranch[],
): SimBranch | undefined {
	for (const branch of branches) {
		if (branch.trigger.some((trigger) => triggerMatches(reply, trigger))) {
			return branch;
		}
	}
	return undefined;
}

export function runSimulation(
	segments: SimSegment[],
	branches: SimBranch[],
	persona: SimPersona,
): SimResult {
	const turns: SimTurn[] = [];
	let terminalBranchId: string | undefined;
	let clarifyUsed = false;
	let clarifyTwice = false;
	let consentGranted = false;
	let documentRequestedWithoutConsent = false;
	let segmentsSpoken = 0;
	let scriptIndex = 0;

	for (const segment of segments) {
		turns.push({ speaker: "agent", text: segment.text, segmentId: segment.id });
		segmentsSpoken += 1;
		if (!consentGranted && requestsDocuments(segment.text)) {
			documentRequestedWithoutConsent = true;
			break;
		}
		if (!segment.listenAfter) {
			continue;
		}
		const line =
			scriptIndex < persona.script.length
				? persona.script[scriptIndex]
				: undefined;
		const reply = line ?? persona.defaultReply;
		scriptIndex += 1;
		turns.push({ speaker: "caller", text: reply });
		if (AFFIRM.test(reply)) {
			consentGranted = true;
		}
		const branch = matchBranch(reply, branches);
		if (branch === undefined) {
			continue;
		}
		if (branch.action === "CLARIFY_ONCE") {
			if (!clarifyUsed) {
				clarifyUsed = true;
				turns.push({
					speaker: "agent",
					text: branch.text,
					branchId: branch.id,
				});
				continue;
			}
			clarifyTwice = true;
		}
		turns.push({ speaker: "agent", text: branch.text, branchId: branch.id });
		terminalBranchId = branch.id;
		break;
	}

	return {
		turns,
		terminalBranchId,
		terminalKind:
			terminalBranchId !== undefined
				? "refusal"
				: consentGranted
					? "consent"
					: "script-end",
		clarifyUsed,
		clarifyTwice,
		consentGranted,
		documentRequestedWithoutConsent,
		segmentsSpoken,
	};
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function scoreSimulation(
	result: SimResult,
	segmentCount: number,
	terminalAction?: string,
): SimScores {
	const compliance: SimCompliance[] = [
		{
			check: "no-document-without-consent",
			pass: !result.documentRequestedWithoutConsent,
			detail: result.documentRequestedWithoutConsent
				? "An agent segment requested documents before explicit consent was recorded."
				: "No agent segment requested documents without recorded consent.",
		},
		{
			check: "clarify-once",
			pass: !result.clarifyTwice,
			detail: result.clarifyTwice
				? "The single clarify allowance was spent and the call probed again."
				: "At most one clarify probe was used.",
		},
		{
			check: "closing-line-spoken",
			pass:
				result.terminalBranchId !== undefined
					? (result.turns.at(-1)?.branchId ?? "") === result.terminalBranchId
					: result.segmentsSpoken >= segmentCount,
			detail:
				result.terminalBranchId !== undefined
					? "The terminal branch spoke its own closing line last."
					: "The full script ran to its close.",
		},
		{
			check: "do-not-contact-honored",
			pass:
				terminalAction === "TERMINATE_AND_OPTOUT"
					? result.turns.findIndex(
							(turn) => turn.branchId === result.terminalBranchId,
						) ===
						result.turns.length - 1
					: true,
			detail:
				terminalAction === "TERMINATE_AND_OPTOUT"
					? "No agent turn follows the opt-out branch."
					: "No opt-out branch fired.",
		},
	];

	const taskCompletion = result.consentGranted
		? 1
		: result.segmentsSpoken >= Math.ceil(segmentCount / 2)
			? 0.5
			: 0.2;
	const efficiency = result.clarifyTwice ? 0.4 : result.clarifyUsed ? 0.7 : 1;

	const estimates =
		result.terminalKind === "consent"
			? {
					interest: 0.9,
					motivation: 0.8,
					urgency: 0.7,
					experience: 0.8,
					budget: 0.6,
				}
			: result.terminalBranchId !== undefined &&
					(terminalAction === "TERMINATE_AND_OPTOUT" ||
						result.terminalBranchId.includes("wrong"))
				? {
						interest: 0.1,
						motivation: 0.1,
						urgency: 0.1,
						experience: 0.3,
						budget: 0.1,
					}
				: result.terminalBranchId !== undefined
					? {
							interest: 0.3,
							motivation: 0.2,
							urgency: 0.2,
							experience: 0.4,
							budget: 0.2,
						}
					: {
							interest: 0.5,
							motivation: 0.4,
							urgency: 0.3,
							experience: 0.5,
							budget: 0.3,
						};

	return {
		taskCompletion: round2(taskCompletion),
		efficiency: round2(efficiency),
		interest: estimates.interest,
		motivation: estimates.motivation,
		urgency: estimates.urgency,
		experience: estimates.experience,
		budget: estimates.budget,
		compliance,
		pass: compliance.every((entry) => entry.pass),
	};
}

export function transcriptExcerpt(result: SimResult, maxTurns = 10): string {
	return result.turns
		.slice(0, maxTurns)
		.map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`)
		.join("\n");
}
