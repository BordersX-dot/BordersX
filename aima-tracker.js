/**
 * aima-tracker.js
 *
 * Daily cron script: checks every tracked AIMA process number for status changes
 * and emails the subscriber if anything has moved.
 *
 * Env vars required (same Railway service as monitor, or its own):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — Resend SMTP
 *   DATA_DIR (optional)                          — defaults to /data
 *
 * Run:  node aima-tracker.js
 * Dry:  DRY_RUN=1 node aima-tracker.js
 */

import fs from "fs";
import path from "path";
import https from "https";
import nodemailer from "nodemailer";

const DATA_DIR = process.env.DATA_DIR || "/data";
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "aima-subscribers.json");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "aima-snapshots");
const DRY_RUN = process.env.DRY_RUN === "1";

// ── Mailer ────────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.resend.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "resend",
    pass: process.env.SMTP_PASS,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function readSubscribers() {
  try {
    const raw = fs.readFileSync(SUBSCRIBERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSubscribers(subs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subs, null, 2));
}

function snapshotPath(processNumber) {
  const safe = processNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SNAPSHOTS_DIR, `${safe}.json`);
}

function readSnapshot(processNumber) {
  try {
    const raw = fs.readFileSync(snapshotPath(processNumber), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSnapshot(processNumber, data) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  fs.writeFileSync(snapshotPath(processNumber), JSON.stringify(data, null, 2));
}

// ── AIMA Status Fetcher ───────────────────────────────────────────────────────
//
// AIMA does not have a public JSON API. We fetch the public-facing status
// page and extract whatever text is present. When AIMA does expose a proper
// API, replace this function.
//
// The status page URL pattern is based on publicly available AIMA portal URLs.
// If the portal URL changes, update AIMA_STATUS_URL below.

const AIMA_STATUS_URL = "https://www.siga.aima.gov.pt/public/agendamento/consulta";

function fetchAimaStatus(processNumber) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ numeroProcesso: processNumber });
    const url = new URL(AIMA_STATUS_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "BordersX-Tracker/1.0",
        Accept: "application/json, text/html",
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: body.slice(0, 4000), // cap size
          fetchedAt: new Date().toISOString(),
        });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "timeout", fetchedAt: new Date().toISOString() });
    });

    req.on("error", (err) => {
      resolve({ status: 0, body: err.message, fetchedAt: new Date().toISOString() });
    });

    req.write(postData);
    req.end();
  });
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function detectChange(prev, current) {
  if (!prev) return { changed: false, reason: "first_check" };
  if (prev.body !== current.body) {
    return { changed: true, reason: "content_changed" };
  }
  return { changed: false, reason: "no_change" };
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendChangeAlert(subscriber, processNumber, prev, current) {
  const name = subscriber.fullName ? subscriber.fullName.split(" ")[0] : "there";
  const subject = `Your AIMA appointment status has changed — ${processNumber}`;

  const text = `Hi ${name},

Something changed on your AIMA process number ${processNumber}.

We detected a change in the status page for your application. Log in to the AIMA portal to see the latest status:

https://www.siga.aima.gov.pt/public/agendamento/consulta

This alert was sent by BordersX — we check your process number every morning and email you the moment anything moves.

---
To stop receiving these alerts, reply to this email with "unsubscribe" in the subject line.

BordersX · Portugal immigration intelligence · bordersx.com`;

  const html = `
<div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1A1917;">
  <div style="background: #0D1F3C; padding: 20px 28px; border-radius: 10px 10px 0 0;">
    <span style="color: #fff; font-size: 1.1rem; font-weight: 600;">BordersX</span>
    <span style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-left: 10px;">AIMA Tracker</span>
  </div>
  <div style="background: #fff; border: 1px solid #E4E0DA; border-top: none; padding: 32px 28px; border-radius: 0 0 10px 10px;">
    <div style="display:inline-block; background: #E6F5F2; color: #0E7C6B; font-size: 0.8rem; font-weight: 600; border-radius: 999px; padding: 5px 14px; margin-bottom: 20px;">
      Status change detected
    </div>
    <h1 style="font-size: 1.35rem; font-weight: 700; margin: 0 0 12px; line-height: 1.3;">
      Your AIMA appointment status has changed
    </h1>
    <p style="color: #5A5651; margin: 0 0 20px; line-height: 1.6;">
      Hi ${name}, we detected a change on process number <strong>${processNumber}</strong>. Check the AIMA portal for your latest appointment details.
    </p>
    <a href="https://www.siga.aima.gov.pt/public/agendamento/consulta"
       style="display: inline-block; background: #0E7C6B; color: #fff; text-decoration: none; padding: 13px 26px; border-radius: 8px; font-weight: 600; font-size: 0.95rem;">
      Check my AIMA status →
    </a>
    <p style="margin: 28px 0 0; font-size: 0.8rem; color: #9A958F; line-height: 1.6;">
      BordersX checks your process number every morning and alerts you whenever something changes.<br>
      To stop receiving these alerts, reply with "unsubscribe" in the subject line.
    </p>
  </div>
</div>`;

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would email ${subscriber.email}: ${subject}`);
    return;
  }

  await transporter.sendMail({
    from: '"BordersX" <alerts@bordersx.com>',
    to: subscriber.email,
    subject,
    text,
    html,
  });

  console.log(`[aima-tracker] Alert sent to ${subscriber.email} for ${processNumber}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[aima-tracker] Starting run at ${new Date().toISOString()} (DRY_RUN=${DRY_RUN})`);

  const subscribers = readSubscribers();
  if (subscribers.length === 0) {
    console.log("[aima-tracker] No subscribers. Done.");
    return;
  }

  console.log(`[aima-tracker] Checking ${subscribers.length} subscriber(s)…`);

  for (const sub of subscribers) {
    const { processNumber, email } = sub;
    if (!processNumber || !email) continue;

    console.log(`[aima-tracker] Fetching status for ${processNumber} (${email})`);

    try {
      const current = await fetchAimaStatus(processNumber);
      const prev = readSnapshot(processNumber);
      const { changed, reason } = detectChange(prev, current);

      writeSnapshot(processNumber, current);

      if (changed) {
        console.log(`[aima-tracker] Change detected for ${processNumber} — sending alert`);
        await sendChangeAlert(sub, processNumber, prev, current);
      } else {
        console.log(`[aima-tracker] No change for ${processNumber} (${reason})`);
      }
    } catch (err) {
      console.error(`[aima-tracker] Error checking ${processNumber}:`, err.message);
    }

    // Polite delay between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("[aima-tracker] Run complete.");
}

run().catch((err) => {
  console.error("[aima-tracker] Fatal error:", err);
  process.exit(1);
});
