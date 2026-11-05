import { EnrichmentStatus } from "@crm/db";
import { APP_AUTH, type AppAuth } from "./app-auth";
import { brandOutcome, runBrand } from "./brand";
import { markRunning, settle } from "./enrichment";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
import {
	claimDue,
	completeTask,
	DIRECT_KINDS,
	type LeasedTask,
	noteSession,
	retireExhausted,
	type TaskSubject,
} from "./tasks";

export const VISIBLE_BATCH = 60;
export const VISIBLE_CONCURRENCY = 6;
export const VISIBLE_LEASE_MS = 2 * 60_000;

export const RESEARCH_BATCH = 12;
export const RESEARCH_LEASE_MS = 30 * 60_000;

export async function retireAbandoned(): Promise<void> {
	let abandoned: TaskSubject[] = [];

	try {
		abandoned = await retireExhausted();
	} catch (error) {
		console.warn({ message: "retireExhausted failed", error });
		return;
	}

	for (const task of abandoned) {
		try {
			await settle(
				task,
				EnrichmentStatus.FAILED,
				"Research was attempted several times and never completed.",
			);
		} catch (error) {
			console.warn({ message: "settle abandoned task failed", error });
		}
	}
}

export async function runVisibleLane(): Promise<number> {
	let handled = 0;

	while (handled < VISIBLE_BATCH) {
		const tasks = await claimDue(
			Math.min(VISIBLE_CONCURRENCY, VISIBLE_BATCH - handled),
			{ only: DIRECT_KINDS },
			VISIBLE_LEASE_MS,
		);

		if (tasks.length === 0) break;

		await runLimited(VISIBLE_CONCURRENCY, tasks, runDirect);
		handled += tasks.length;
	}

	return handled;
}

async function runDirect(task: LeasedTask): Promise<void> {
	try {
		if (task.kind === "brand" && task.companyId) {
			const result = await runBrand({ companyId: task.companyId });
			if (result.retryable) return;

			await completeTask(task.id, brandOutcome(result));
			return;
		}

		if (task.kind === "portrait" && task.contactId) {
			const portrait = await runPortrait({
				contactId: task.contactId,
				spend: () => ({ ok: true }),
			});

			await completeTask(
				task.id,
				portrait.stored
					? `Picture stored from ${portrait.source}.`
					: (portrait.reason ?? "No picture found."),
			);
			return;
		}

		await completeTask(task.id, "The record this names is gone.");
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		try {
			await settle(task, EnrichmentStatus.FAILED, reason);
		} catch (e) {
			console.warn({ message: "settle direct task failed", error: e });
		}
	}
}

export async function runResearchLane(
	start: (task: LeasedTask) => Promise<{ id: string }>,
): Promise<number> {
	const tasks = await claimDue(
		RESEARCH_BATCH,
		{ except: DIRECT_KINDS },
		RESEARCH_LEASE_MS,
	);
	if (tasks.length === 0) return 0;

	await Promise.all(
		tasks.map(async (task) => {
			try {
				await markRunning(task);
				const session = await start(task);
				await noteSession(task.id, session.id);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				try {
					await settle(task, EnrichmentStatus.FAILED, reason);
				} catch (e) {
					console.warn({ message: "settle research task failed", error: e });
				}
			}
		}),
	);

	return tasks.length;
}

export function taskAuth(task: LeasedTask, base: AppAuth = APP_AUTH): AppAuth {
	return {
		...base,
		attributes: {
			taskKind: task.kind,
			reason: task.reason,
			budget: String(task.budget),
			...(task.contactId ? { contactId: task.contactId } : {}),
			...(task.companyId ? { companyId: task.companyId } : {}),
		},
	};
}

export const drainAll = collapsing(
	async (start: (task: LeasedTask) => Promise<{ id: string }>) => {
		await retireAbandoned();
		await Promise.all([runVisibleLane(), runResearchLane(start)]);
	},
);

export function brief(task: LeasedTask): string {
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason);
}

function work(kind: string, reason: string): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "call":
			return `Before dialing, load the voice-ai-cold-calling-research-first skill with load_skill and follow its research-first procedure. Call load_pitch with pitchId research-first-cold-call-v1 and pass verified company_name and call_purpose values from the workspace or task context; do not invent missing values. Use the returned refusalBranches and consentRules with listen_on_call on relevant turns. Use make_call and inspect its result before speaking. For an answered local call, keep short speak_on_call turns followed by listen_on_call; for a queued hosted call, use call_status and do not use local speech tools. Use record_call_outcome for the observed outcome, keep DO_NOT_CALL permanent, and flag a missing number with flag_for_osint rather than inventing one.`;
		case "voice-batch":
			return `This contact is one of a bulk call batch. Before dialing, load the voice-ai-cold-calling-research-first skill with load_skill and follow its research-first procedure exactly as for a single call. Call load_pitch with pitchId research-first-cold-call-v1 and pass verified company_name and call_purpose values from the workspace or task context; do not invent missing values. Use the returned refusalBranches and consentRules with listen_on_call on relevant turns, then call make_call and inspect its result. Use speak_on_call and listen_on_call only for an answered local call; use call_status for a hosted queued call. Record the observed outcome with record_call_outcome, keep DO_NOT_CALL permanent, and flag a missing number with flag_for_osint rather than inventing one. Batch pace never overrides consent or refusal policy.`;
		case "osint-enrich":
			return "Verify and enrich this contact from public sources: phone number, email address, current title. Correct the record where you find something better and note what you could not settle.";
		case "company-profile":
			return "This company's brand, industry, location and links are filled in separately and may already be there. Read the account, fill anything still missing and write a brief if there is something worth saying.";
		case "workspace-profile":
			return "Write the profile of the company you work for, so that every other session knows who we are. Read our own site and keep it short.";
		default:
			return `Handle this: ${reason}`;
	}
}
