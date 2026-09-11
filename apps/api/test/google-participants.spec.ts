import { describe, expect, it } from "bun:test";
import {
	dominantDomain,
	externalParticipants,
	isAutomatedAddress,
	isDerivedName,
	type Participant,
	parseAddress,
	parseAddressList,
	splitName,
	workDomain,
} from "../src/google/participants";

const person = (email: string, name: string | null = null): Participant => ({
	email,
	name,
});

describe("parseAddress", () => {
	const cases: [string, Participant | null][] = [
		["jane@acme.com", person("jane@acme.com")],
		["Jane Doe <jane@acme.com>", person("jane@acme.com", "Jane Doe")],
		['"Doe, Jane" <jane@acme.com>', person("jane@acme.com", "Doe, Jane")],
		["  JANE@ACME.COM  ", person("jane@acme.com")],
		["Jane Doe", null],
		["", null],
		["<>", null],
	];

	for (const [input, expected] of cases) {
		it(`parses ${JSON.stringify(input)}`, () => {
			expect(parseAddress(input)).toEqual(expected);
		});
	}
});

describe("parseAddressList", () => {
	it("does not split on a comma inside a quoted display name", () => {
		const parsed = parseAddressList(
			'"Doe, Jane" <jane@acme.com>, bob@acme.com',
		);

		expect(parsed).toEqual([
			person("jane@acme.com", "Doe, Jane"),
			person("bob@acme.com"),
		]);
	});

	it("deduplicates repeated addresses", () => {
		expect(parseAddressList("a@acme.com, A@ACME.COM")).toHaveLength(1);
	});

	it("returns nothing for an absent header", () => {
		expect(parseAddressList(null)).toEqual([]);
		expect(parseAddressList(undefined)).toEqual([]);
	});
});

describe("isAutomatedAddress", () => {
	it("catches the machines", () => {
		for (const email of [
			"noreply@acme.com",
			"no-reply@acme.com",
			"notifications@acme.com",
			"mailer-daemon@acme.com",
			"bounces+123@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(true);
		}
	});

	it("does not catch people whose names start with a marker", () => {
		for (const email of [
			"robert@acme.com",
			"bouncer@acme.com",
			"note@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(false);
		}
	});
});

describe("workDomain", () => {
	it("rejects the free hosts", () => {
		expect(workDomain("someone@gmail.com")).toBeNull();
		expect(workDomain("someone@icloud.com")).toBeNull();
	});

	it("returns the bare host for a work address", () => {
		expect(workDomain("jane@Acme.com")).toBe("acme.com");
	});
});

describe("externalParticipants", () => {
	const options = {
		ourDomains: new Set(["trycomp.ai"]),
		ourAddresses: new Set(["lewis@trycomp.ai"]),
		suppressedDomains: new Set(["greenhouse.io"]),
	};

	it("keeps only the other side of the conversation", () => {
		const result = externalParticipants(
			[
				person("lewis@trycomp.ai"),
				person("colleague@trycomp.ai"),
				person("jane@acme.com", "Jane"),
			],
			options,
		);

		expect(result).toEqual([person("jane@acme.com", "Jane")]);
	});

	it("drops free hosts, suppressed domains and machines", () => {
		const result = externalParticipants(
			[
				person("someone@gmail.com"),
				person("recruiter@greenhouse.io"),
				person("noreply@acme.com"),
				person("jane@acme.com"),
			],
			options,
		);

		expect(result).toEqual([person("jane@acme.com")]);
	});

	it("returns nothing for a wholly internal thread", () => {
		expect(
			externalParticipants([person("colleague@trycomp.ai")], options),
		).toEqual([]);
	});
});

describe("dominantDomain", () => {
	it("picks the best-represented domain", () => {
		const domain = dominantDomain([
			person("a@acme.com"),
			person("b@acme.com"),
			person("lawyer@legal.com"),
		]);

		expect(domain).toBe("acme.com");
	});

	it("breaks a tie towards a company we already have", () => {
		const domain = dominantDomain(
			[person("a@acme.com"), person("lawyer@legal.com")],
			new Set(["acme.com"]),
		);

		expect(domain).toBe("acme.com");
	});

	it("is null when nobody has a work domain", () => {
		expect(dominantDomain([person("someone@gmail.com")])).toBeNull();
	});
});

describe("splitName", () => {
	const cases: [
		string | null,
		string,
		{ firstName: string; lastName: string | null },
	][] = [
		["Jane Doe", "jane@acme.com", { firstName: "Jane", lastName: "Doe" }],
		["Doe, Jane", "jane@acme.com", { firstName: "Jane", lastName: "Doe" }],
		[
			"Jane van der Berg",
			"jane@acme.com",
			{ firstName: "Jane", lastName: "van der Berg" },
		],
		["Jane", "jane@acme.com", { firstName: "Jane", lastName: null }],
		[null, "jane.doe@acme.com", { firstName: "Jane", lastName: "Doe" }],
		[null, "jane@acme.com", { firstName: "Jane", lastName: null }],
		["jane@acme.com", "jane@acme.com", { firstName: "Jane", lastName: null }],
	];

	for (const [name, email, expected] of cases) {
		it(`splits ${JSON.stringify(name)} / ${email}`, () => {
			expect(splitName(name, email)).toEqual(expected);
		});
	}
});

describe("isAutomatedAddress — scheduling tools", () => {
	it("catches the addresses invites are sent from", () => {
		for (const email of [
			"calendar-invite@lu.ma",
			"invites@calendly.com",
			"scheduling@acme.com",
			"bookings@acme.com",
			"meetings@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(true);
		}
	});

	it("catches shared inboxes, which are not people", () => {
		for (const email of [
			"sales@acme.com",
			"support@acme.com",
			"info@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(true);
		}
	});

	it("still lets real people through", () => {
		for (const email of [
			"pmarchetti@fernhill.com",
			"helena@acme.com",
			"infante@acme.com",
			"contacts.lead@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(false);
		}
	});
});

describe("isDerivedName", () => {
	it("recognises a name that came from the address alone", () => {
		expect(isDerivedName("pmarchetti@fernhill.com", "Pmarchetti", null)).toBe(
			true,
		);
		expect(isDerivedName("jane.doe@acme.com", "Jane", "Doe")).toBe(true);
	});

	it("leaves a real name alone", () => {
		expect(isDerivedName("pmarchetti@fernhill.com", "Paula", "Marchetti")).toBe(
			false,
		);
		expect(isDerivedName("jane.doe@acme.com", "Jane", "Doherty")).toBe(false);
	});
});
