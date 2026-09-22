import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = [
	"generate",
	"-e",
	"src/app.module.ts",
	"-r",
	"**/*.router.ts",
	"-o",
	"src/generated",
];
try {
	execFileSync("npx", ["nestjs-trpc", ...args], { stdio: "inherit" });
} catch (e) {
	if (existsSync("src/generated/server.ts")) {
		console.warn(
			"nestjs-trpc binary blocked (AV/EFTYPE) - using existing src/generated/server.ts",
		);
		process.exit(0);
	}
	console.error(e.message);
	process.exit(1);
}
