import "@crm/env/load";
import { SipClient } from "../agent/lib/telephony/sip-client";

function mask(value: string): string {
	if (value.length <= 6) return value.length > 0 ? "***" : "(unset)";
	return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function portFromEnv(): number {
	const parsed = Number.parseInt(process.env.NONOH_SIP_PORT ?? "", 10);
	return Number.isNaN(parsed) ? 5060 : parsed;
}

const server = process.env.NONOH_SIP_SERVER?.trim() ?? "";
const username = process.env.NONOH_USERNAME?.trim() ?? "";
const password = process.env.NONOH_PASSWORD?.trim() ?? "";
const configured =
	server.length > 0 && username.length > 0 && password.length > 0;

console.log("Nonoh SIP REGISTER probe");
console.log("------------------------");
console.log(`configured : ${configured ? "yes" : "no"}`);
console.log(`server     : ${server || "(unset)"}:${portFromEnv()}`);
console.log(`username   : ${mask(username)}`);
console.log(`password   : ${password.length > 0 ? "set" : "(unset)"}`);

if (!configured) {
	console.log("");
	console.log("RESULT: FAIL - Nonoh SIP is not configured.");
	process.exit(1);
}

const client = await SipClient.create();
console.log(
	`public     : ${client.publicAddress.ip}:${client.publicAddress.port} (via ${client.publicAddressSource})`,
);
console.log("");

const statuses: number[] = [];
const result = await client.register({
	onResponse: (status) => {
		if (status === 0) return;
		statuses.push(status);
		console.log(`response   : ${status}`);
	},
});

console.log("");
console.log(
	`responses  : ${statuses.length > 0 ? statuses.join(", ") : "(none)"}`,
);
console.log(`registered : ${result.ok ? "yes" : "no"}`);
if (result.reason) console.log(`reason     : ${result.reason}`);
console.log("");
console.log(
	`RESULT: ${result.ok ? "PASS - REGISTER answered 200 OK" : "FAIL"}`,
);

client.close();
process.exit(result.ok ? 0 : 1);
