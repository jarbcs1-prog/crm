import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ModelCatalogService } from "./model-catalog.service";
import { SettingsRouter } from "./settings.router";
import { SettingsService } from "./settings.service";

@Module({
	imports: [TrpcModule],
	providers: [ModelCatalogService, SettingsService, SettingsRouter],
	exports: [SettingsService],
})
export class SettingsModule {}
