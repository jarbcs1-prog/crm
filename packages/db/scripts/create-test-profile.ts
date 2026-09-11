import { db } from "../src/client";
const email = "jarbcs1@gmail.com";
const phone = "+639686774401";
const firstName = "John";
const lastName = "B";
const existing = await db.contact.findUnique({ where: { email } });
if (existing) {
  const updated = await db.contact.update({
    where: { email },
    data: { firstName, lastName, phone },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  console.log(JSON.stringify(updated));
} else {
  const owner = await db.user.findFirst({ select: { id: true } });
  const created = await db.contact.create({
    data: {
      firstName,
      lastName,
      email,
      phone,
      ownerId: owner?.id,
      source: "MANUAL",
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  console.log(JSON.stringify(created));
}
await db.$disconnect();
