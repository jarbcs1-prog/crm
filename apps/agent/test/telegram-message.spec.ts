import { afterEach, describe, expect, it } from "bun:test";

const originalFetch = global.fetch;
const originalEnv = {
	TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
	TELEGRAM_HOME_CHANNEL: process.env.TELEGRAM_HOME_CHANNEL ?? "",
};

function mockFetch(response: unknown) {
	(global.fetch as unknown) = async () =>
		new Response(JSON.stringify(response), {
			headers: { "Content-Type": "application/json" },
		});
}

function restoreAll() {
	(global.fetch as unknown) = originalFetch;
	process.env.TELEGRAM_BOT_TOKEN = originalEnv.TELEGRAM_BOT_TOKEN;
	process.env.TELEGRAM_HOME_CHANNEL = originalEnv.TELEGRAM_HOME_CHANNEL;
}

describe("send_telegram_message", () => {
	afterEach(() => {
		restoreAll();
	});

	it("returns an error when TELEGRAM_BOT_TOKEN is not set", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "";

		const result = await import("../agent/tools/send_telegram_message").then(
			(m) => m.sendTelegramMessage({ text: "Hello" }),
		);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("TELEGRAM_BOT_TOKEN");
	});

	it("returns an error when TELEGRAM_HOME_CHANNEL is not set and no chatId is provided", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
		process.env.TELEGRAM_HOME_CHANNEL = "";

		const result = await import("../agent/tools/send_telegram_message").then(
			(m) => m.sendTelegramMessage({ text: "Hello" }),
		);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("chatId");
	});

	it("returns an error when the Telegram API returns an error", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
		process.env.TELEGRAM_HOME_CHANNEL = "12345";
		mockFetch({ ok: false, description: "Bad Request: chat not found" });

		const result = await import("../agent/tools/send_telegram_message").then(
			(m) => m.sendTelegramMessage({ text: "Hello" }),
		);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Bad Request");
	});

	it("returns success when the Telegram API accepts the message", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
		process.env.TELEGRAM_HOME_CHANNEL = "12345";
		mockFetch({ ok: true, result: { message_id: 42 } });

		const result = await import("../agent/tools/send_telegram_message").then(
			(m) => m.sendTelegramMessage({ text: "Hello Shelf-Thought" }),
		);

		expect(result.ok).toBe(true);
		expect(result.messageId).toBe(42);
	});
});
