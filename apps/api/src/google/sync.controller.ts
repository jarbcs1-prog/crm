import { timingSafeEqual } from "node:crypto";
import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { GoogleSyncService } from "./google-sync.service";

@Controller("internal/sync")
export class SyncController {
	private readonly logger = new Logger(SyncController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly sync: GoogleSyncService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("google")
	@AllowAnonymous()
	async googleViaGet(@Headers("authorization") authorization?: string) {
		return this.google(authorization);
	}

	@Post("google")
	@AllowAnonymous()
	async googleViaPost(@Headers("authorization") authorization?: string) {
		return this.google(authorization);
	}

	private async google(authorization?: string) {
		if (!this.secret) {
			this.logger.error({
				message: "CRON_SECRET is not set — refusing to run the sync route.",
			});
			throw new ServiceUnavailableException("Sync is not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		return this.sync.runDue();
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		const dummy = Buffer.alloc(Math.max(bufA.length, bufB.length));
		try {
			timingSafeEqual(dummy, dummy);
		} catch {}
		return false;
	}
	try {
		return timingSafeEqual(bufA, bufB);
	} catch {
		return false;
	}
}
