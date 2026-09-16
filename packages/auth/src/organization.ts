import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { ownerEmails } from "./workspace";

export { WORKSPACE_ID };

export const WORKSPACE_SLUG = "workspace";

export const DEFAULT_WORKSPACE_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export async function removeMember(
	actingUserId: string,
	memberId: string,
): Promise<void> {
	await db.$transaction(
		async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
			const acting = await tx.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId: WORKSPACE_ID,
						userId: actingUserId,
					},
				},
				select: { role: true },
			});
			if (!acting || !isWorkspaceAdmin(acting.role as WorkspaceRole)) {
				throw new Error("Only an owner or an admin can remove a member.");
			}

			const target = await tx.member.findFirst({
				where: { id: memberId, organizationId: WORKSPACE_ID },
				select: { id: true, userId: true, role: true },
			});
			if (!target) throw new Error("That person is not in this workspace.");

			if (target.role === "owner") {
				if (acting.role !== "owner") {
					throw new Error("Only an owner can remove another owner.");
				}
				const owners = await tx.$queryRaw<{ id: string }[]>`
				SELECT id FROM "member"
				WHERE "organizationId" = ${WORKSPACE_ID} AND role = 'owner'
				FOR UPDATE
			`;
				if (owners.length <= 1) {
					throw new Error(
						"The workspace needs an owner. Make someone else an owner first.",
					);
				}
			}

			await tx.member.delete({ where: { id: target.id } });
			await tx.session.deleteMany({ where: { userId: target.userId } });
		},
	);
}

export async function ensureWorkspaceMembership(
	userId: string,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const workspace = await tx.organization.upsert({
				where: { id: WORKSPACE_ID },
				create: {
					id: WORKSPACE_ID,
					name: DEFAULT_WORKSPACE_NAME,
					slug: WORKSPACE_SLUG,
					createdAt: new Date(),
				},
				update: {},
				select: { id: true },
			});

			const enrolled = await tx.member.count({
				where: { organizationId: workspace.id },
			});

			if (enrolled === 0) {
				const owners = ownerEmails();
				const existing = await tx.user.findMany({
					select: { id: true, email: true },
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				});

				const members = existing.map(
					(user: { id: string; email: string }, index: number) => ({
						id: crypto.randomUUID(),
						organizationId: workspace.id,
						userId: user.id,
						role:
							owners.size > 0
								? owners.has(user.email.toLowerCase())
									? "owner"
									: "member"
								: index === 0
									? "owner"
									: "member",
						createdAt: new Date(),
					}),
				);

				if (
					owners.size > 0 &&
					!members.some((m: { role: string }) => m.role === "owner")
				) {
					const first = members[0];
					if (first) first.role = "owner";
				}

				await tx.member.createMany({
					data: members,
					skipDuplicates: true,
				});
			}

			await tx.member.upsert({
				where: {
					organizationId_userId: { organizationId: workspace.id, userId },
				},
				create: {
					id: crypto.randomUUID(),
					organizationId: workspace.id,
					userId,
					role: "member",
					createdAt: new Date(),
				},
				update: {},
			});

			return workspace.id;
		});
	} catch (error) {
		console.error(
			`[auth] could not enrol user ${userId} in workspace ${WORKSPACE_ID}; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}
