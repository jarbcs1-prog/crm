import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type ActivityTarget = {
	companyId?: string | null;
	contactId?: string | null;
	dealId?: string | null;
};

@Injectable()
export class ActivityStampService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async touch(target: ActivityTarget, at: Date): Promise<void> {
		const stale = {
			OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }],
		};

		await Promise.all([
			target.companyId
				? this.db.company.updateMany({
						where: { id: target.companyId, ...stale },
						data: { lastActivityAt: at },
					})
				: null,
			target.contactId
				? this.db.contact.updateMany({
						where: { id: target.contactId, ...stale },
						data: { lastActivityAt: at },
					})
				: null,
			target.dealId
				? this.db.deal.updateMany({
						where: { id: target.dealId, ...stale },
						data: { lastActivityAt: at },
					})
				: null,
		]);
	}

	async recompute(target: ActivityTarget): Promise<void> {
		if (target.companyId) {
			const { _max } = await this.db.activity.aggregate({
				where: { companyId: target.companyId },
				_max: { createdAt: true },
			});
			await this.db.company.update({
				where: { id: target.companyId },
				data: { lastActivityAt: _max.createdAt },
			});
		}

		if (target.contactId) {
			const { _max } = await this.db.activity.aggregate({
				where: { contactId: target.contactId },
				_max: { createdAt: true },
			});
			await this.db.contact.update({
				where: { id: target.contactId },
				data: { lastActivityAt: _max.createdAt },
			});
		}

		if (target.dealId) {
			const { _max } = await this.db.activity.aggregate({
				where: { dealId: target.dealId },
				_max: { createdAt: true },
			});
			await this.db.deal.update({
				where: { id: target.dealId },
				data: { lastActivityAt: _max.createdAt },
			});
		}
	}

	async recomputeAll(): Promise<void> {
		await this.db.$transaction([
			this.db.$executeRaw`
				UPDATE "company" c
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "companyId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "companyId" IS NOT NULL GROUP BY "companyId"
				) a
				WHERE c.id = a.id AND c."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "company" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "companyId" FROM "activity" WHERE "companyId" IS NOT NULL)`,
			this.db.$executeRaw`
				UPDATE "contact" c
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "contactId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "contactId" IS NOT NULL GROUP BY "contactId"
				) a
				WHERE c.id = a.id AND c."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "contact" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "contactId" FROM "activity" WHERE "contactId" IS NOT NULL)`,
			this.db.$executeRaw`
				UPDATE "deal" d
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "dealId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "dealId" IS NOT NULL GROUP BY "dealId"
				) a
				WHERE d.id = a.id AND d."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "deal" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "dealId" FROM "activity" WHERE "dealId" IS NOT NULL)`,
		]);
	}
}
