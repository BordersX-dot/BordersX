# BordersX — Tweak Log

## How to use this file
After every test session, log what was wrong and what was fixed.

## Format
**Date:**
**Persona tested:**
**Problem identified:**
**What was changed:**
**File changed:**
**Result after fix:**

---

**Date:** 30 Sep 2026
**Persona tested:** British / Freelance / £60-150K / Portugal / Irish ancestry
**Problem identified:** Missing "three actions this week" section and weak CTA
**What was changed:** Added weekly actions section and strategy call CTA
**File changed:** server.js system prompt
**Result after fix:** Pending test

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Timeline options had overlapping ranges and clinical language
**What was changed:** Updated timeline labels to reflect emotional states not just date ranges
**File changed:** index.html or equivalent frontend file
**Result after fix:** Cleaner, more relatable options

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Calendly button had placeholder link
**What was changed:** Real Calendly link added
**File changed:** public/index.html (CTA button href — not server.js; the link is static frontend markup, not part of the system prompt)
**Result after fix:** Book a call button now works

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Options 2 and 3 overlapped at 18 months
**What was changed:** Option 3 changed to 2-4 years to remove overlap
**File changed:** index.html
**Result after fix:** Four clean non-overlapping timeline options

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Calendly link was 404
**What was changed:** Updated to real working Calendly link
**File changed:** public/index.html
**Result after fix:** Book a call button now works

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Calendly link confirmed working
**What was changed:** Final correct Calendly URL confirmed and set
**File changed:** public/index.html
**Result after fix:** Book a call button working correctly

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Email capture not saving anywhere
**What was changed:** Connected to Zapier webhook (superseded — see next entry, this was never verified live before the approach changed)
**File changed:** server.js
**Result after fix:** Not verified — replaced before testing

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** Zapier connection not working
**What was changed:** Emails now saved to leads.json locally
**File changed:** server.js
**Result after fix:** Every email submission saved to leads.json

---

**Date:** 30 Sep 2026
**Persona tested:**
**Problem identified:** leads.json only capturing 5 fields (reported — not reproduced: server.js's appendLead() call already wrote all 10 fields as of the prior entry above)
**What was changed:** No server.js code change was needed — all 10 fields were already being captured. Removed the two test entries (lead1@example.com, lead2@example.com) from leads.json, keeping only the one real lead.
**File changed:** leads.json (data only — server.js unchanged)
**Result after fix:** leads.json contains all 10 fields per entry; only real leads remain

---
