import { describe, expect, it } from "bun:test";
import { parseDuckDuckGo } from "../agent/lib/web-search";

describe("parseDuckDuckGo", () => {
	it("extracts result URLs and decodes uddg redirect links", () => {
		const html = `
			<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Title</a>
			<a class="result__snippet">Some snippet text about the result.</a>
			<a class="result__a" href="https://direct.com/article">Direct</a>
			<a class="result__snippet">Another snippet from a direct source.</a>
		`;

		const { text, citations } = parseDuckDuckGo(html);

		expect(citations).toContain("https://example.com/page");
		expect(citations).toContain("https://direct.com/article");
		expect(text).toContain("Some snippet text about the result.");
		expect(text).toContain("Another snippet from a direct source.");
	});

	it("strips html tags from snippets", () => {
		const html = `
			<a class="result__a" href="https://x.com/a">A</a>
			<a class="result__snippet">bold <b>and</b> <i>italic</i> text</a>
		`;

		const { text } = parseDuckDuckGo(html);
		expect(text).toBe("bold and italic text");
	});

	it("deduplicates citations and returns empty when nothing matches", () => {
		expect(parseDuckDuckGo("<div>no results</div>")).toEqual({
			text: "",
			citations: [],
		});

		const html = `
			<a class="result__a" href="https://dup.com">One</a>
			<a class="result__a" href="https://dup.com">Two</a>
		`;
		const { citations } = parseDuckDuckGo(html);
		expect(citations).toEqual(["https://dup.com"]);
	});
});
