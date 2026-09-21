import {
	type MediaOffer,
	SipClient,
	type SipDialog,
} from "./telephony/sip-client";

const DEFAULT_MEDIA_PORT = 40000;

export interface NonohConfig {
	server: string;
	port: number;
	tls: boolean;
	username: string;
	password: string;
	displayName: string;
}

export interface NonohCallResult {
	ok: boolean;
	status?: number;
	callId?: string;
	sipCallId?: string;
	reason?: string;
	remoteMedia?: { ip: string; port: number; payloadType: number };
	dialog?: SipDialog;
}

const dialogs = new Map<string, SipDialog>();
let shared: SipClient | null = null;

async function sharedClient(): Promise<SipClient> {
	shared ??= await SipClient.create();
	return shared;
}

function defaultMedia(client: SipClient): MediaOffer {
	return { ip: client.publicAddress.ip, port: DEFAULT_MEDIA_PORT };
}

export class NonohSipClient {
	private sip: SipClient | null = null;
	private registered = false;

	get isConfigured(): boolean {
		return nonohConfigured();
	}

	get isRegistered(): boolean {
		return this.registered;
	}

	async register(): Promise<boolean> {
		if (!this.isConfigured) return false;
		const client = await this.client();
		if (!client) return false;
		const result = await client.register();
		this.registered = result.ok;
		return result.ok;
	}

	async makeCall(
		toNumber: string,
		media?: MediaOffer,
	): Promise<NonohCallResult> {
		if (!this.isConfigured) {
			return { ok: false, reason: "Nonoh SIP not configured." };
		}
		const client = await this.client();
		if (!client) {
			return { ok: false, reason: "Nonoh SIP transport unavailable." };
		}

		const result = await client.invite(toNumber, media ?? defaultMedia(client));

		if (result.ok && result.sipCallId && result.dialog) {
			this.registered = true;
			dialogs.set(result.sipCallId, result.dialog);
		}

		return {
			ok: result.ok,
			callId: result.sipCallId,
			sipCallId: result.sipCallId,
			status: result.status,
			reason: result.reason,
			remoteMedia: result.remoteMedia,
			dialog: result.dialog,
		};
	}

	async hangup(sipCallId: string): Promise<void> {
		const dialog = dialogs.get(sipCallId);
		if (!dialog) return;
		dialogs.delete(sipCallId);
		const client = await this.client();
		if (!client) return;
		await client.bye(dialog);
	}

	close(): void {
		this.sip?.close();
		this.sip = null;
		this.registered = false;
	}

	private async client(): Promise<SipClient | null> {
		if (this.sip) return this.sip;
		try {
			this.sip = await sharedClient();
		} catch {
			return null;
		}
		return this.sip;
	}
}

export function nonohConfigured(): boolean {
	return (
		(process.env.NONOH_SIP_SERVER?.trim() ?? "").length > 0 &&
		(process.env.NONOH_USERNAME?.trim() ?? "").length > 0 &&
		(process.env.NONOH_PASSWORD?.trim() ?? "").length > 0
	);
}

export async function nonohRegister(): Promise<boolean> {
	if (!nonohConfigured()) return false;
	const client = await sharedClient();
	const result = await client.register();
	return result.ok;
}

export async function nonohMakeCall(
	toNumber: string,
	media?: MediaOffer,
): Promise<NonohCallResult> {
	if (!nonohConfigured()) {
		return { ok: false, reason: "Nonoh SIP not configured." };
	}

	const client = await sharedClient();
	const result = await client.invite(toNumber, media ?? defaultMedia(client));

	if (result.ok && result.sipCallId && result.dialog) {
		dialogs.set(result.sipCallId, result.dialog);
	}

	return {
		ok: result.ok,
		callId: result.sipCallId,
		sipCallId: result.sipCallId,
		status: result.status,
		reason: result.reason,
		remoteMedia: result.remoteMedia,
		dialog: result.dialog,
	};
}

export async function nonohHangup(sipCallId: string): Promise<void> {
	const dialog = dialogs.get(sipCallId);
	if (!dialog) return;
	dialogs.delete(sipCallId);
	const client = await sharedClient();
	await client.bye(dialog);
}

export const NONOH_CONFIG: NonohConfig = {
	get server(): string {
		return process.env.NONOH_SIP_SERVER?.trim() ?? "";
	},
	get port(): number {
		const parsed = Number.parseInt(process.env.NONOH_SIP_PORT ?? "", 10);
		return Number.isNaN(parsed) ? 5060 : parsed;
	},
	get tls(): boolean {
		return (process.env.NONOH_SIP_TLS ?? "false") === "true";
	},
	get username(): string {
		return process.env.NONOH_USERNAME?.trim() ?? "";
	},
	get password(): string {
		return process.env.NONOH_PASSWORD?.trim() ?? "";
	},
	get displayName(): string {
		return process.env.NONOH_DISPLAY_NAME?.trim() ?? "";
	},
};
