import { CallSession, getSession } from "../agent/lib/telephony/session";
import { db } from "@crm/db";

const JOHN_EMAIL = "jarbcs1@gmail.com";
const TEST_PITCH = "Hello John, this is an AI assistant test call from your CRM voice agent via Nonoh SIP. This is a simulated test, not legal advice. I am calling your test profile to verify retrieval from the database and SIP connection. If you can hear this clearly, say hello and I will log the activity. Thanks for helping test the pipeline, John.";

async function main() {
  console.log("=== CRM Voice Agent Test Call (Session-based) ===");

  // 1. Look up John in CRM database
  console.log("\n[1] Looking up John in CRM database...");
  const contact = await db.contact.findUnique({
    where: { email: JOHN_EMAIL },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true }
  });
  if (!contact) {
    console.error("ERROR: John not found in CRM database");
    process.exit(1);
  }
  console.log("Found:", JSON.stringify(contact, null, 2));

  // 2. Dial the call using CallSession (proper RTP + audio pipeline)
  console.log("\n[2] Dialing", contact.phone, "via CallSession...");
  const dialResult = await CallSession.dial(contact.phone);

  if (!dialResult.ok) {
    console.error("ERROR: Call failed:", dialResult.reason);
    process.exit(1);
  }

  const session = dialResult.session!;
  console.log("Call connected! SIP Call ID:", session.sipCallId);
  console.log("RTP stats:", session.stats);

  // 3. Speak the test pitch
  console.log("\n[3] Speaking test pitch via ElevenLabs TTS...");
  const speakResult = await session.speak(TEST_PITCH);
  if (!speakResult.ok) {
    console.error("ERROR: Speak failed:", speakResult.reason);
  } else {
    console.log("Speech delivered successfully!");
  }

  // 4. Listen for a response (optional - wait up to 10 seconds)
  console.log("\n[4] Listening for response (up to 10s)...");
  try {
    const recording = await session.listen({ maxMs: 10000 });
    if (recording.length > 0) {
      console.log("Heard something! Recording size:", recording.length, "bytes");
      // Try to transcribe
      const transcribed = await session.transcribeHeard(recording);
      if (transcribed) {
        console.log("Transcription:", transcribed);
      } else {
        console.log("Could not transcribe (STT may not be configured)");
      }
    } else {
      console.log("No speech detected");
    }
  } catch (e) {
    console.log("Listen error:", e.message);
  }

  // 5. Hang up
  console.log("\n[5] Hanging up...");
  await session.hangup();
  console.log("Call ended");

  console.log("\n=== TEST COMPLETE ===");
  console.log("John's phone:", contact.phone);
  console.log("SIP Call ID:", session.sipCallId);

  await db.$disconnect();
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
