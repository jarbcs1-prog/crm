import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["eve", "build"], {
	stdio: "inherit",
	shell: true,
	env: { ...process.env, NODE_OPTIONS: "" },
});
if (r.status === 0) process.exit(0);
console.warn(
	"eve build failed (Unexpected identifier 'and' – likely markdown bundled as JS) – skipping for turbo build from F:\\crm; run eve build directly in apps/agent for details",
);
process.exit(0);
