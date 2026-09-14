import { defineChannel, POST } from "eve/channels";
import { brief, drainAll, taskAuth } from "../lib/dispatch";

export default defineChannel({
	routes: [
		POST("/internal/telegram/webhook", async (request, { send, waitUntil }) => {
			try {
				const body = await request.json();
				const message = extractMessage(body);
				if (!message) {
					return new Response("OK", { status: 200 });
				}

				waitUntil(
					drainAll((task) =>
						send(brief(task), {
							auth: taskAuth(task),
							continuationToken: `telegram:${task.id}`,
						}),
					),
				);
			} catch {
				return new Response("Bad request", { status: 400 });
			}

			return new Response("OK", { status: 200 });
		}),
	],

	events: {
		async "session.waiting"(_data, channel) {
			const taskId = channel.continuationToken.replace("telegram:", "");
			if (!taskId) return;
		},
	},

	async receive(input, { send }) {
		const taskId =
			typeof input.target?.taskId === "string" ? input.target.taskId : null;

		return send(input.message, {
			auth: input.auth,
			continuationToken: taskId
				? `telegram:${taskId}`
				: `telegram:${crypto.randomUUID()}`,
		});
	},
});

function extractMessage(body: unknown): { chatId: string; text: string } | null {
	if (
		typeof body === "object" &&
		body !== null &&
		"message" in body &&
		typeof (body as { message: unknown }).message === "object"
	) {
		const msg = (body as { message: { chat?: { id?: number }; text?: string } }).message;
		if (typeof msg.text === "string" && typeof msg.chat?.id === "number") {
			return { chatId: String(msg.chat.id), text: msg.text };
		}
	}
	return null;
}
