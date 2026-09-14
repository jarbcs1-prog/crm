import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { sendTelegramMessage } from "../agent/tools/send_telegram_message";

const originalFetch = global.fetch;

function mockFetch(response: unknown) {
	global.fetch = (async () =>
		new Response(JSON.stringify(response), {
			headers: { "Content-Type": "application/json" },
		})) as typeof fetch;
}

function restoreFetch() {
	global.fetch = originalFetch;
}

describe("send_telegram_message", () => {
	afterEach(() => {
		restoreFetch();
	});

	it("returns an error when TELEGRAM_BOT_TOKEN is not set", async () => {
		const saved = process.env.TELEGRAM_BOT_TOKEN;
		delete process.env.TELEGRAM_BOT_TOKEN;

		const result = await sendTelegramMessage({ chatId: "12345", text: "Hello" });

		expect(result.ok).toBe(false);
		expect(result.error).toContain("TELEGRAM_BOT_TOKEN");

		if (saved !== undefined) process.env.TELEGRAM_BOT_TOKEN = saved;
	});

	it("returns an error when the Telegram API returns an error", async () => {
		const saved = process.env.TELEGRAM_BOT_TOKEN;
		process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
		mockFetch({ ok: false, description: "Bad Request: chat not found" });

		const result = await sendTelegramMessage({ chatId: "12345", text: "Hello" });

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Bad Request");

		if (saved !== undefined) process.env.TELEGRAM_BOT_TOKEN = saved;
		else delete process.env.TELEGRAM_BOT_TOKEN;
	});

	it("returns success when the Telegram API accepts the message", async () => {
		const saved = process.env.TELEGRAM_BOT_TOKEN;
		process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
		mockFetch({ ok: true, result: { message_id: 42 } });

		const result = await sendTelegramMessage({ chatId: "12345", text: "Hello Shelf-Thought" });

		expect(result.ok).toBe(true);
		expect(result.messageId).toBe(42);

		if (saved !== undefined) process.env.TELEGRAM_BOT_TOKEN = saved;
		else delete process.env.TELEGRAM_BOT_TOKEN;
	});
});
