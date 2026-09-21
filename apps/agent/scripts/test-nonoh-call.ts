import { nonohMakeCall, nonohConfigured } from "../agent/lib/nonoh-sip";
const to = "+639686774401";
console.log("configured:", nonohConfigured());
console.log("calling", to, "with test mini pitch");
const r = await nonohMakeCall(to);
console.log(JSON.stringify(r, null, 2));
if (!r.ok) process.exit(1);
setTimeout(async () => {
  const { nonohHangup } = await import("../agent/lib/nonoh-sip");
  if (r.sipCallId) await nonohHangup(r.sipCallId);
  console.log("hung up");
  process.exit(0);
}, 15000);
