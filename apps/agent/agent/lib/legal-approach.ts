export const LEGAL_APPROACH_SCRIPT = [
	"Identify yourself and your company at the start of the call.",
	"Confirm you are speaking with the decision-maker or the person authorized to act.",
	"Ask about their current situation and any challenges they are facing.",
	"Qualify their budget and timeline for a potential partnership.",
	"Assess fit with our offering based on what they share.",
	"If qualified, propose concrete next steps. If not viable, record as DO_NOT_CALL.",
	"If they express interest, record as INTERESTED and schedule a follow-up.",
	"If concerns exist, record as FOLLOW_UP with the concerns noted.",
	"End the call respectfully when asked — no pressure, no claims you cannot back.",
].join(" ");

export function qualifyOutcome(
	interested: boolean,
	concerns: boolean,
	viable: boolean,
): string {
	if (!viable) return "DO_NOT_CALL";
	if (!interested) return "NOT_INTERESTED";
	if (concerns) return "FOLLOW_UP";
	return "INTERESTED";
}

export function legalApproachPrompt(contactName: string): string {
	return [
		`Qualify ${contactName} using the legal approach script.`,
		"",
		"Script:",
		LEGAL_APPROACH_SCRIPT,
		"",
		"After the call, record the outcome with record_call_outcome.",
		"Use INTERESTED if qualified, FOLLOW_UP if there are concerns,",
		"DO_NOT_CALL if not viable, NOT_INTERESTED if not interested.",
		"If the contact has no phone number on file, flag them for OSINT",
		"with flag_for_osint instead of inventing a number.",
	].join("\n");
}
