import "@crm/env/load";
import { CallSession } from "../agent/lib/telephony/session";

const PHRASE = "Echo probe. Alpha seven four two nine. Over.";
const DEFAULT_TARGETS = ["3333@sip.antisip.com", "echo@iptel.org"];
const INBOUND_WINDOW_MS = 5000;
const SILENCE_MS = 1200;
const MIN_SPEECH_MS = 400;
const PEAK_FLOOR = 120;
const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE = 8000;
const REFUSED = new Set([403, 404, 484, 603, 604, 606]);

function isSipUri(target: string): boolean {
	const trimmed = target.trim();
	if (trimmed.startsWith("sip:") || trimmed.startsWith("sips:")) return true;
	if (!trimmed.includes("@")) return false;

	const host = trimmed.slice(trimmed.lastIndexOf("@") + 1).split(":")[0] ?? "";
	return host.length > 0 && !/^[\d\s+().-]+$/.test(host);
}

async function transcriptOf(
	session: CallSession,
	wav: Buffer,
	seconds: number,
): Promise<string | null> {
	if (seconds <= 0.2) return null;

	try {
		return await session.transcribeHeard(wav);
	} catch (error) {
		console.log(
			`  transcribe: FAILED - ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function secondsOf(wav: Buffer): number {
	const samples = Math.max(0, wav.length - WAV_HEADER_BYTES) / 2;
	return samples / SAMPLE_RATE;
}

type ProbeResult = {
	answered: boolean;
	verified: boolean;
	status?: number;
};

async function probe(target: string): Promise<ProbeResult> {
	console.log("");
	console.log(`target     : ${target}`);

	const dial = await CallSession.dial(target);

	if (!dial.ok || !dial.session) {
		console.log("  answered  : no");
		console.log(
			`  status    : ${dial.status === undefined ? "(no final response)" : `SIP ${dial.status}`}`,
		);
		console.log(`  reason    : ${dial.reason ?? "(no reason given)"}`);
		return { answered: false, verified: false, status: dial.status };
	}

	const session = dial.session;
	console.log(`  answered  : yes (SIP 200 OK)`);
	console.log(`  call-id   : ${session.sipCallId}`);

	try {
		const spoken = await session.speak(PHRASE);
		console.log(
			spoken.ok
				? `  spoke     : "${PHRASE}"`
				: `  spoke     : FAILED - ${spoken.reason ?? "unknown"}`,
		);

		const heard = await session.listen({
			maxMs: INBOUND_WINDOW_MS,
			silenceMs: SILENCE_MS,
			minSpeechMs: MIN_SPEECH_MS,
		});

		const stats = session.stats;
		const seconds = secondsOf(heard);

		console.log(`  txPackets : ${stats.txPackets}`);
		console.log(`  rxPackets : ${stats.rxPackets}`);
		console.log(`  rxSource  : ${stats.rxSource ?? "(nothing received)"}`);
		console.log(`  peak      : ${stats.peak}`);
		console.log(`  heard     : ${seconds.toFixed(2)} s`);

		let verdict = "MEDIA PATH VERIFIED";

		if (stats.rxPackets === 0) {
			verdict = "ONE-WAY AUDIO";
			console.log(`  transcript: (skipped - no inbound audio to transcribe)`);
			console.log("");
			console.log("DIAGNOSIS: ONE-WAY AUDIO.");
			console.log(
				`  No inbound RTP arrived in the ${INBOUND_WINDOW_MS / 1000} s after answer (rxPackets = 0),`,
			);
			console.log(`  although ${stats.txPackets} packets were sent.`);
			console.log("  Likely causes, most to least likely:");
			console.log(
				"   1. A SIP ALG in the router rewrote the SDP media address. Disable",
			);
			console.log(
				'      "SIP ALG" / "SIP passthrough" / "SIP application helper" on the router.',
			);
			console.log(
				"   2. The far end sends RTP from a different port than it advertised.",
			);
			console.log(
				"      The session latches onto the first inbound source, but nothing",
			);
			console.log(
				"      arrived to latch onto, so our NAT pinhole never opened.",
			);
			console.log(
				"   3. Outbound UDP to the advertised media address is blocked, so our",
			);
			console.log("      audio never reached the echo service.");
			console.log(
				"  This is NOT a codec problem: a payload mismatch still delivers packets.",
			);
		} else if (stats.peak < PEAK_FLOOR) {
			verdict = "SILENT PAYLOAD";
			console.log("");
			console.log("DIAGNOSIS: PAYLOAD PROBLEM, NOT A NAT PROBLEM.");
			console.log(
				`  ${stats.rxPackets} packets arrived from ${stats.rxSource ?? "unknown"}, so SDP and NAT are fine,`,
			);
			console.log(
				`  but the loudest sample was ${stats.peak} (near digital silence).`,
			);
			console.log(
				"  Check the negotiated payload type: we only decode PCMU/8000 (PT 0).",
			);
			console.log(
				"  A wrong payload type, a muted far end, or a G.722-only answer",
			);
			console.log("  all look exactly like this.");
			const transcript = await transcriptOf(session, heard, seconds);
			console.log(`  transcript: ${transcript ?? "(none)"}`);
		} else {
			const transcript = await transcriptOf(session, heard, seconds);
			console.log(`  transcript: ${transcript ?? "(none)"}`);
			if (!transcript) verdict = "AUDIO BUT NO TRANSCRIPT";
		}

		console.log("");
		console.log(`  VERDICT   : ${verdict}`);
		return {
			answered: true,
			verified: verdict === "MEDIA PATH VERIFIED",
		};
	} finally {
		await session.hangup();
	}
}

const override = process.argv[2]?.trim() || process.env.SIP_ECHO_TARGET?.trim();
const targets = override ? [override, ...DEFAULT_TARGETS] : DEFAULT_TARGETS;

console.log("SIP echo probe (media path end to end)");
console.log("-------------------------------------");
console.log(
	`server     : ${process.env.NONOH_SIP_SERVER?.trim() || "(unset)"}:${process.env.NONOH_SIP_PORT?.trim() || "5060"}`,
);
console.log(
	`stun       : ${process.env.NONOH_STUN_SERVER?.trim() || "(unset)"}`,
);
console.log(
	`whisper    : ${process.env.FASTER_WHISPER_URL?.trim() || "(unset - transcription will be skipped)"}`,
);
console.log(`phrase     : "${PHRASE}"`);

let answered = false;
let verified = false;
let refused = false;
let unreachable = false;

for (const target of targets) {
	if (!isSipUri(target)) {
		console.log("");
		console.log(
			`REFUSING to dial "${target}": this probe only dials SIP URIs.`,
		);
		console.log(
			"PSTN/E.164 destinations are chargeable and are out of scope here.",
		);
		continue;
	}

	const result = await probe(target);

	if (result.answered) {
		answered = true;
		verified = result.verified;
		break;
	}

	if (result.status !== undefined && REFUSED.has(result.status)) {
		refused = true;
		continue;
	}

	unreachable = true;
}

console.log("");
if (verified) {
	console.log(
		"RESULT: PASS - outbound and inbound RTP both flowed and the echo was transcribed.",
	);
	process.exit(0);
}

if (answered) {
	console.log(
		"RESULT: FAIL - the call was answered but the media path is broken.",
	);
	process.exit(1);
}

if (refused) {
	console.log("RESULT: INCONCLUSIVE - the provider refused external SIP URIs.");
	console.log(
		"  This is a valid finding, not a failure to hide: the account registers and",
	);
	console.log(
		"  authenticates, but the proxy will not route calls off-net. External SIP",
	);
	console.log(
		"  echo services cannot be used to test the media path from this account;",
	);
	console.log(
		"  a PSTN call (chargeable) or a provider-side test number is required.",
	);
	process.exit(1);
}

if (unreachable) {
	console.log(
		"RESULT: INCONCLUSIVE - the echo services did not respond at all (timeout).",
	);
	process.exit(1);
}

console.log("RESULT: FAIL - no usable echo target.");
process.exit(1);
