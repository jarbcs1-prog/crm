import { Inject } from "@nestjs/common";
import { Ctx, Query, Router } from "nestjs-trpc";
import { AuthService } from "../auth/auth.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { UsersService } from "./users.service";

@Router({ alias: "users" })
export class UsersRouter {
	constructor(
		@Inject(UsersService) private readonly users: UsersService,
		@Inject(AuthService) private readonly auth: AuthService,
	) {}

	@Query()
	async me(@Ctx() ctx: AuthedTrpcContext) {
		return this.auth.getProfile(ctx.user.id);
	}

	@Query()
	async list() {
		return this.users.list();
	}
}
