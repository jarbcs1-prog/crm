import { db } from "@crm/db";
import { findSwedishContacts } from "./agent/tools/find_swedish_contacts";

const c = await db.contact.create({
	data: {
		firstName: "T",
		lastName: "S",
		email: "t-swed-debug@example.test",
		phone: "+46701946961",
		country: "Sweden",
		lastActivityAt: new Date(),
	},
});
const check = await db.contact.findUnique({
	where: { id: c.id },
	select: { id: true, country: true, phone: true, firstName: true },
});
console.log("check:", JSON.stringify(check));
const result = await findSwedishContacts({ limit: 1000 });
const ids = result.contacts.map((c: any) => c.id);
console.log("created:", c.id);
console.log("found:", ids.length);
console.log("contains:", ids.includes(c.id));
await db.contact.deleteMany({
	where: { email: { startsWith: "t-swed-debug" } },
});
