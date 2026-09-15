import { defineChannel, POST } from "eve/channels";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import { sendTelegramMessage } from "../tools/send_telegram_message";

const TELEGRAM_USER_ID = process.env.TELEGRAM_USERID ?? "";
const TELEGRAM_HOME_CHANNEL = process.env.TELEGRAM_HOME_CHANNEL ?? "";

export default defineChannel({
	routes: [
		POST("/internal/telegram/webhook", async (request, { send, waitUntil }) => {
			try {
				const body = await request.json();
				const message = extractMessage(body);
				if (!message) {
					return new Response("OK", { status: 200 });
				}

				if (!isAuthorized(message.chatId)) {
					return new Response("Unauthorized", { status: 403 });
				}

				const commandResult = await handleCommand(message.chatId, message.text);
				if (commandResult !== null) {
					if (commandResult.ok) {
						return new Response("OK", { status: 200 });
					}
					return new Response(commandResult.error ?? "Error", { status: 500 });
				}

				const _targetChannel = TELEGRAM_HOME_CHANNEL || message.chatId;

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

async function handleCommand(
	chatId: string,
	text: string,
): Promise<{ ok: boolean; error?: string } | null> {
	const trimmed = text.trim();
	const firstSpace = trimmed.indexOf(" ");
	const command =
		firstSpace >= 0
			? trimmed.slice(0, firstSpace).toLowerCase()
			: trimmed.toLowerCase();
	const arg = firstSpace >= 0 ? trimmed.slice(firstSpace + 1).trim() : "";

	if (!command.startsWith("/")) return null;

	switch (command) {
		case "/start":
		case "/help": {
			await sendTelegramMessage({ chatId, text: getHelpText() });
			return { ok: true };
		}
		case "/status": {
			const status = await getStatus();
			await sendTelegramMessage({ chatId, text: status });
			return { ok: true };
		}
		case "/test": {
			const result = await sendTelegramMessage({
				chatId,
				text: "Shelf-Thought CRM bot is alive. All systems nominal.",
			});
			if (result.ok) {
				await sendTelegramMessage({
					chatId,
					text: "Test message delivered successfully.",
				});
			} else {
				await sendTelegramMessage({
					chatId,
					text: `Test failed: ${result.error}`,
				});
			}
			return { ok: true };
		}
		case "/send": {
			if (!arg) {
				await sendTelegramMessage({
					chatId,
					text: "Usage: /send <message> — sends a message to the home channel.",
				});
				return { ok: true };
			}
			const result = await sendTelegramMessage({ text: arg });
			if (result.ok) {
				await sendTelegramMessage({
					chatId,
					text: `Message sent to channel (message_id: ${result.messageId}).`,
				});
			} else {
				await sendTelegramMessage({
					chatId,
					text: `Send failed: ${result.error}`,
				});
			}
			return { ok: true };
		}
		case "/queue": {
			await sendTelegramMessage({
				chatId,
				text: "Queue processing is active. Check the agent dashboard for details.",
			});
			return { ok: true };
		}
		case "/config": {
			const token = process.env.TELEGRAM_BOT_TOKEN
				? `${process.env.TELEGRAM_BOT_TOKEN.slice(0, 6)}...${process.env.TELEGRAM_BOT_TOKEN.slice(-4)}`
				: "NOT SET";
			await sendTelegramMessage({
				chatId,
				text: `Bot token: \`${token}\`\nUser ID: ${TELEGRAM_USER_ID || "NOT SET"}\nHome channel: ${TELEGRAM_HOME_CHANNEL || "NOT SET"}`,
			});
			return { ok: true };
		}
		case "/webhook": {
			await sendTelegramMessage({
				chatId,
				text: "Webhook endpoint: POST /internal/telegram/webhook\nAuthorized users: TELEGRAM_USERID\nStatus: Active",
			});
			return { ok: true };
		}
		default:
			return null;
	}
}

function getHelpText(): string {
	return [
		"🛠 **Shelf-Thought CRM Bot Commands**",
		"",
		"`/start` or `/help` — Show this message",
		"`/status` — Bot health and config summary",
		"`/test` — Send a test message to your chat",
		"`/send <message>` — Send a message to the home channel",
		"`/queue` — Check dispatch queue status",
		"`/config` — Show bot configuration",
		"`/webhook` — Show webhook endpoint info",
	].join("\n");
}

async function getStatus(): Promise<string> {
	const token = process.env.TELEGRAM_BOT_TOKEN ? "configured" : "NOT SET";
	const userId = TELEGRAM_USER_ID || "NOT SET";
	const channel = TELEGRAM_HOME_CHANNEL || "NOT SET";
	return [
		"🟢 **Shelf-Thought CRM Bot Status**",
		"",
		`Bot token: ${token}`,
		`User ID: ${userId}`,
		`Home channel: ${channel}`,
		`Webhook: /internal/telegram/webhook`,
		`Server: ${process.env.API_URL || "http://localhost:3001"}`,
	].join("\n");
}

function isAuthorized(chatId: string): boolean {
	if (!TELEGRAM_USER_ID) return false;
	return chatId === TELEGRAM_USER_ID;
}

function extractMessage(
	body: unknown,
): { chatId: string; text: string } | null {
	if (
		typeof body === "object" &&
		body !== null &&
		"message" in body &&
		typeof (body as { message: unknown }).message === "object"
	) {
		const msg = (body as { message: { chat?: { id?: number }; text?: string } })
			.message;
		if (typeof msg.text === "string" && typeof msg.chat?.id === "number") {
			return { chatId: String(msg.chat.id), text: msg.text };
		}
	}
	return null;
}
