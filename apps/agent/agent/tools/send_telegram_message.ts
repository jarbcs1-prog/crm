import { z } from "zod";
import { defineTool } from "../lib/tool-factory";

export async function sendTelegramMessage(input: {
	chatId?: string;
	text: string;
	disableNotification?: boolean;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set." };
	}

	const homeChannel = process.env.TELEGRAM_HOME_CHANNEL ?? "";
	const chatId = input.chatId ?? homeChannel;
	if (!chatId) {
		return {
			ok: false,
			error: "No chatId provided and TELEGRAM_HOME_CHANNEL is not set.",
		};
	}

	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: input.text,
		disable_notification: input.disableNotification ?? false,
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		const data = (await response.json()) as {
			ok?: boolean;
			result?: { message_id?: number };
			description?: string;
		};

		if (data.ok && data.result?.message_id) {
			return { ok: true, messageId: data.result.message_id };
		}

		return {
			ok: false,
			error: data.description ?? "Unknown Telegram API error",
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export default defineTool({
	description:
		"Sends a message to a Telegram chat via the Telegram Bot API. Requires TELEGRAM_BOT_TOKEN.",
	inputSchema: z.object({
		chatId: z
			.string()
			.optional()
			.describe(
				"The Telegram chat ID to send the message to. Defaults to TELEGRAM_HOME_CHANNEL.",
			),
		text: z.string().min(1).describe("The message text to send."),
		disableNotification: z
			.boolean()
			.optional()
			.describe("Whether to send silently."),
	}),
	async execute({ chatId, text, disableNotification }) {
		return sendTelegramMessage({ chatId, text, disableNotification });
	},
});
