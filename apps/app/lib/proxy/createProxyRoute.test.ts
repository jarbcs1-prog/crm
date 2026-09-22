import { describe, expect, it } from "bun:test";
import { createProxyRoute } from "./createProxyRoute";

describe("createProxyRoute", () => {
	it("returns handlers for GET/POST", () => {
		const handlers = createProxyRoute({
			targetBaseUrl: "http://localhost:3001",
		});
		expect(typeof handlers.GET).toBe("function");
		expect(typeof handlers.POST).toBe("function");
	});
});
