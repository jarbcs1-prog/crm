import "@crm/env/load";

import { selectDefaultModel } from "@crm/db/settings";
import { defineAgent, defineDynamic } from "eve";
import { capabilities } from "./lib/capabilities";
import { selectedModel } from "./lib/model";

for (const capability of capabilities()) {
	console.log(
		`[agent] ${capability.enabled ? "on " : "off"}  ${capability.label} (${capability.env})`,
	);
}

const defaultModel = selectDefaultModel();

export default defineAgent({
	model: defineDynamic({
		fallback: defaultModel.id,
		events: { "session.started": () => selectedModel() },
	}),
	modelContextWindowTokens: defaultModel.contextWindowTokens,
});
