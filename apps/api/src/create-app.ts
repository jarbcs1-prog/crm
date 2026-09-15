import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ContextLogger } from "./logging/context-logger";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);

	const isProd = process.env.NODE_ENV === "production";
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
			},
			crossOriginResourcePolicy: { policy: "cross-origin" },
			hsts: isProd
				? { maxAge: 31536000, includeSubDomains: true, preload: true }
				: false,
		}),
	);
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	return app;
}
