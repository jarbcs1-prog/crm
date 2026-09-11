import "@crm/env/load";

import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { defineAgent, defineDynamic } from "eve";
import { capabilities } from "./lib/capabilities";
import { selectedModel } from "./lib/model";

for (const capability of capabilities()) {
	console.log(
		`[agent] ${capability.enabled ? "on " : "off"}  ${capability.label} (${capability.env})`,
	);
}

export default defineAgent({
	model: defineDynamic({
		fallback: DEFAULT_AGENT_MODEL.id,
		events: { "session.started": () => selectedModel() },
	}),
	modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
});
