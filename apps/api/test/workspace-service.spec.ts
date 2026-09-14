import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { WorkspaceService } from "../src/workspace/workspace.service";

function svcWith(role: string | null, overrides: Record<string, unknown> = {}) {
	const seen: Record<string, unknown> = {};
	const db = {
		member: {
			findUnique: async () => (role === null ? null : { role }),
			findFirst: async (args: unknown) => {
				seen.findFirst = args;
				return (overrides.findFirst as () => unknown)?.() ?? null;
			},
			delete: async (args: unknown) => {
				seen.delete = args;
				return {};
			},
		},
		session: {
			deleteMany: async (args: unknown) => {
				seen.deleteMany = args;
				return {};
			},
		},
		$transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
			const tx = {
				member: {
					findFirst: async (args: unknown) => {
						seen.txFindFirst = args;
						return (overrides.txFindFirst as () => unknown)?.() ?? null;
					},
					delete: async (args: unknown) => {
						seen.txDelete = args;
						return {};
					},
				},
				session: {
					deleteMany: async (args: unknown) => {
						seen.txDeleteMany = args;
						return {};
					},
				},
				$queryRaw: async () => (overrides.queryRaw as () => unknown)?.() ?? [],
			};
			return fn(tx);
		},
		$executeRaw: async () => 0,
		organization: { findUnique: async () => null },
	} as unknown as Db;

	const agent = { workspaceChanged: async () => {} } as unknown as import("../src/agent/agent-trigger.service").AgentTriggerService;

	return { svc: new WorkspaceService(db, agent), seen };
}

describe("WorkspaceService.removeMember", () => {
	it("refuses a non-admin", async () => {
		const { svc } = svcWith("member");
		expect(svc.removeMember("user_1", "member_2")).rejects.toThrow();
	});

	it("refuses to remove the last owner", async () => {
		const { svc } = svcWith("owner", {
			txFindFirst: () => ({ id: "m1", userId: "u1", role: "owner" }),
			queryRaw: () => [{ id: "m1" }],
		});

		expect(svc.removeMember("user_1", "m1")).rejects.toThrow("needs an owner");
	});

	it("deletes the member and revokes sessions", async () => {
		const { svc, seen } = svcWith("owner", {
			txFindFirst: () => ({ id: "m1", userId: "u_target", role: "member" }),
			queryRaw: () => [{ id: "m1" }, { id: "m2" }],
		});

		await svc.removeMember("user_1", "m1");

		expect(seen.txDelete).toEqual({ where: { id: "m1" } });
		expect(seen.txDeleteMany).toEqual({ where: { userId: "u_target" } });
	});

	it("requires an owner to remove another owner", async () => {
		const { svc } = svcWith("admin", {
			txFindFirst: () => ({ id: "m1", userId: "u1", role: "owner" }),
			queryRaw: () => [{ id: "m1" }, { id: "m2" }],
		});

		expect(svc.removeMember("user_1", "m1")).rejects.toThrow("Only an owner can remove");
	});

	it("refuses to demote the last owner", async () => {
		const db = {
			member: {
				findUnique: async () => ({ role: "owner" }),
				findFirst: async () => ({ id: "m1", role: "owner" }),
			},
			$transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					member: {
						findFirst: async () => ({ id: "m1", role: "owner" }),
						update: async () => ({}),
					},
					$queryRaw: async () => [{ id: "m1" }],
				};
				return fn(tx);
			},
		} as unknown as Db;

		const agent = { workspaceChanged: async () => {} } as unknown as never;
		const { WorkspaceService: WS } = await import("../src/workspace/workspace.service");
		const svc = new WS(db, agent);

		expect(svc.setMemberRole("user_1", { memberId: "m1", role: "member" })).rejects.toThrow(
			"needs an owner",
		);
	});
});
