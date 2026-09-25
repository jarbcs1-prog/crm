import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "demo.db");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);

const db = new DatabaseSync(DB_PATH);

function normalizeToE164(phone) {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (hasPlus ? "+" : "+") + digits;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      company_id TEXT REFERENCES companies(id),
      owner_id TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      value_cents INTEGER NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'NEW',
      contact_id TEXT REFERENCES contacts(id)
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      contact_id TEXT REFERENCES contacts(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      contact_id TEXT REFERENCES contacts(id),
      callee_number TEXT NOT NULL,
      sip_call_id TEXT,
      provider TEXT NOT NULL DEFAULT 'nonoh',
      status TEXT NOT NULL DEFAULT 'QUEUED',
      direction TEXT NOT NULL DEFAULT 'OUTBOUND',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function seed() {
  migrate();
  if (count("contacts") > 0 && !process.argv.includes("--reseed")) return;
  if (process.argv.includes("--reseed")) {
    for (const t of ["calls", "activities", "deals", "contacts", "companies", "users"]) {
      db.exec(`DELETE FROM ${t}`);
    }
  }
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO users (id, name, email) VALUES (?, ?, ?)").run("u-owner", "John B.", "jarbcs1@gmail.com");
  db.prepare("INSERT OR REPLACE INTO companies (id, name, domain) VALUES (?, ?, ?)").run("co-demo", "Demo Co", "example.com");
  db.prepare("INSERT OR REPLACE INTO contacts (id, name, email, phone, company_id, owner_id) VALUES (?, ?, ?, ?, ?, ?)").run(
    "c-john", "John B.", "john.b@example.com", "+639686774401", "co-demo", "u-owner",
  );
  db.prepare("INSERT OR REPLACE INTO contacts (id, name, email, phone, company_id, owner_id) VALUES (?, ?, ?, ?, ?, ?)").run(
    "c-dan", "Dan Da Man", "dan.da.man@example.com", "+639495771881", "co-demo", "u-owner",
  );
  db.prepare("INSERT OR REPLACE INTO deals (id, title, value_cents, stage, contact_id) VALUES (?, ?, ?, ?, ?)").run(
    "d-1", "Demo SIP pilot", 500000, "NEW", "c-dan",
  );
  db.prepare("INSERT OR REPLACE INTO activities (id, kind, body, contact_id, created_at) VALUES (?, ?, ?, ?, ?)").run(
    "a-1", "NOTE", "Seeded demo note — edit or delete freely.", "c-john", now,
  );
  db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run("voice_provider", "nonoh");
  const nonohDefaults = [
    ["nonoh_sip_server", ""],
    ["nonoh_sip_port", "5060"],
    ["nonoh_use_tls", "0"],
    ["nonoh_username", ""],
    ["nonoh_password", ""],
    ["nonoh_display_name", "CRM Demo"],
    ["nonoh_stun_server", ""],
    ["nonoh_stun_port", "3478"],
  ];
  for (const [k, v] of nonohDefaults) {
    db.prepare("INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)").run(k, v);
  }
  console.log("Seeded: John B. (+639686774401), Dan Da Man (+639495771881)");
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const PITCH_PATH = path.join(__dirname, "pitches", "research-first-cold-call-v1.json");

function loadPitch({ firstName = "", company_name = "", call_purpose = "" } = {}) {
  const raw = JSON.parse(fs.readFileSync(PITCH_PATH, "utf8"));
  const vars = { firstName, company_name, call_purpose };
  const fill = (text) => String(text).replace(/\{([^{}]{1,64})\}/g, (m, k) => vars[k] ?? m);
  const missing = ["company_name", "call_purpose"].filter((k) => !vars[k]);
  return {
    pitchId: raw.id,
    name: raw.name,
    variables: raw.variables,
    segments: (raw.conversation || []).map((s) => ({ ...s, text: fill(s.text) })),
    refusalBranches: raw.refusal_branches || [],
    consentRules: raw.consent_rules || {},
    states: raw.states || {},
    policy: raw.policy || {},
    ...(missing.length ? { missing, missingNote: "Supply company_name and call_purpose — placeholders are never read aloud." } : {}),
  };
}

function kvGet(key) {
  return db.prepare("SELECT value FROM kv WHERE key = ?").get(key)?.value ?? "";
}

function nonohSettings() {
  const s = {
    sip_server: kvGet("nonoh_sip_server"),
    sip_port: kvGet("nonoh_sip_port") || "5060",
    use_tls: kvGet("nonoh_use_tls") === "1",
    username: kvGet("nonoh_username"),
    display_name: kvGet("nonoh_display_name"),
    stun_server: kvGet("nonoh_stun_server"),
    stun_port: kvGet("nonoh_stun_port") || "3478",
  };
  return { ...s, passwordConfigured: kvGet("nonoh_password") !== "", configured: Boolean(s.sip_server && s.username && kvGet("nonoh_password")) };
}

function send(res, code, body, type = "application/json") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": type });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

seed();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/contacts") {
      return send(res, 200, db.prepare("SELECT c.*, co.name AS company_name FROM contacts c LEFT JOIN companies co ON co.id = c.company_id ORDER BY c.name").all());
    }
    if (url.pathname === "/api/calls") {
      return send(res, 200, db.prepare("SELECT calls.*, contacts.name AS contact_name FROM calls LEFT JOIN contacts ON contacts.id = calls.contact_id ORDER BY calls.created_at DESC LIMIT 50").all());
    }
    if (url.pathname === "/api/companies") return send(res, 200, db.prepare("SELECT * FROM companies").all());
    if (url.pathname === "/api/deals") return send(res, 200, db.prepare("SELECT * FROM deals").all());
    if (url.pathname === "/api/activities") return send(res, 200, db.prepare("SELECT * FROM activities ORDER BY created_at DESC LIMIT 50").all());
    if (url.pathname === "/api/provider") {
      const row = db.prepare("SELECT value FROM kv WHERE key = 'voice_provider'").get();
      return send(res, 200, { provider: row?.value ?? "nonoh" });
    }
    if (url.pathname === "/api/sip/nonoh") {
      return send(res, 200, nonohSettings());
    }
    if (url.pathname === "/api/pitch") {
      const contactId = url.searchParams.get("contactId");
      const contact = contactId ? db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId) : null;
      const company = contact ? db.prepare("SELECT * FROM companies WHERE id = ?").get(contact.company_id) : null;
      const firstName = (contact?.name || "").split(" ")[0];
      return send(res, 200, loadPitch({
        firstName,
        company_name: url.searchParams.get("company_name") || company?.name || "",
        call_purpose: url.searchParams.get("call_purpose") || "a brief introduction to how we help teams follow up faster",
      }));
    }
    return send(res, 404, { error: "not found" });
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/contacts/")) {
    const id = url.pathname.split("/").pop();
    const body = await readBody(req);
    const existing = db.prepare("SELECT * FROM contacts WHERE id = ?").get(id);
    if (!existing) return send(res, 404, { error: "contact not found" });
    if (body.phone !== undefined) {
      const e164 = normalizeToE164(body.phone);
      if (!e164) return send(res, 400, { error: "phone must be valid E.164 (e.g. +15551234567), 7-15 digits" });
      db.prepare("UPDATE contacts SET phone = ? WHERE id = ?").run(e164, id);
    }
    if (body.name !== undefined) db.prepare("UPDATE contacts SET name = ? WHERE id = ?").run(String(body.name), id);
    if (body.email !== undefined) db.prepare("UPDATE contacts SET email = ? WHERE id = ?").run(String(body.email), id);
    return send(res, 200, db.prepare("SELECT * FROM contacts WHERE id = ?").get(id));
  }

  if (req.method === "POST" && url.pathname === "/api/provider") {
    const body = await readBody(req);
    const allowed = ["nonoh", "voipstudio", "twilio", "plivo", "vapi"];
    if (!allowed.includes(body.provider)) return send(res, 400, { error: `provider must be one of ${allowed.join(", ")}` });
    db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('voice_provider', ?)").run(body.provider);
    return send(res, 200, { provider: body.provider });
  }

  if (req.method === "POST" && url.pathname === "/api/sip/nonoh") {
    const body = await readBody(req);
    const fields = ["sip_server", "sip_port", "use_tls", "username", "password", "display_name", "stun_server", "stun_port"];
    for (const f of fields) {
      if (body[f] === undefined) continue;
      const v = f === "use_tls" ? (body[f] ? "1" : "0") : String(body[f]).trim();
      if (f === "sip_port" || f === "stun_port") {
        if (v && !/^\d{1,5}$/.test(v)) return send(res, 400, { error: `${f} must be a port number` });
      }
      db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(`nonoh_${f}`, v);
    }
    return send(res, 200, nonohSettings());
  }

  if (req.method === "POST" && url.pathname === "/api/calls") {
    const body = await readBody(req);
    const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(body.contactId);
    if (!contact) return send(res, 404, { error: "contact not found" });
    const calleeNumber = normalizeToE164(contact.phone);
    if (!calleeNumber) return send(res, 400, { error: `contact phone ${contact.phone} is not valid E.164 — update it first` });
    if (!contact.owner_id) return send(res, 400, { error: "contact has no owner — assign one first" });
    const providerRow = db.prepare("SELECT value FROM kv WHERE key = 'voice_provider'").get();
    const provider = body.provider || providerRow?.value || "nonoh";
    let sipVia = null;
    if (provider === "nonoh") {
      const sip = nonohSettings();
      if (!sip.configured) {
        return send(res, 409, { error: "Nonoh SIP not configured — set sip server, username and password first", missing: ["sip_server", "username", "password"].filter((k) => (k === "sip_server" ? !sip.sip_server : k === "username" ? !sip.username : !sip.passwordConfigured)) });
      }
      sipVia = `${sip.username}@${sip.sip_server}:${sip.sip_port}${sip.use_tls ? " (TLS)" : ""}`;
    }
    const id = `call-${Date.now().toString(36)}`;
    const sipCallId = provider === "nonoh" ? `demo-nonoh-${id}` : `demo-${provider}-${id}`;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO calls (id, contact_id, callee_number, sip_call_id, provider, status, direction, created_at) VALUES (?, ?, ?, ?, ?, 'QUEUED', 'OUTBOUND', ?)").run(
      id, contact.id, calleeNumber, sipCallId, provider, now,
    );
    db.prepare("INSERT INTO activities (id, kind, body, contact_id, created_at) VALUES (?, 'CALL', ?, ?, ?)").run(
      `a-${id}`, `Outbound call QUEUED via ${provider}${sipVia ? ` (${sipVia})` : ""} to ${calleeNumber} (sipCallId ${sipCallId})`, contact.id, now,
    );
    return send(res, 201, { id, status: "QUEUED", direction: "OUTBOUND", calleeNumber, sipCallId, provider, ...(sipVia ? { via: sipVia } : {}) });
  }

  if (req.method === "GET" && (url.pathname === "/" || !url.pathname.startsWith("/api/"))) {
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    const fp = path.join(PUBLIC_DIR, file);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      return send(res, 200, fs.readFileSync(fp, "utf8"), MIME[path.extname(fp)] || "text/plain");
    }
    return send(res, 404, "not found", "text/plain");
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(`crm-demo listening on http://localhost:${PORT}`));
