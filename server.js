import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, "knowledge.json");
const LEADS_PATH = path.join(__dirname, "leads.json");

if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes("your-key-here")) {
  console.warn(
    "[bordersx] Warning: ANTHROPIC_API_KEY is not set in .env — /api/analyze will fail until you add a real key."
  );
}

if (!process.env.RESEND_API_KEY) {
  console.warn(
    "[bordersx] Warning: RESEND_API_KEY is not set — new-lead email notifications will be skipped."
  );
}

const anthropic = new Anthropic();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Direct link to the Settler module: same page as the homepage, and app.js
// opens the Settler picker when it sees this path.
app.get("/settler", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Letters (incl. accented), spaces, hyphens, apostrophes — covers things
// like "Bosnian-Herzegovinian" or "Côte d'Ivoire" adjectives.
const NATIONALITY_TEXT_PATTERN = /^[\p{L}\s'-]+$/u;

const AnswersSchema = z
  .object({
    email: z.string().email(),
    nationality: z.enum(["British", "American", "Other"]),
    nationalityOther: z.string().max(100).optional(),
    incomeType: z.string().min(1).max(200),
    incomeLevel: z.string().min(1).max(200),
    goal: z.string().min(1).max(300),
    destinationCountry: z.string().min(1).max(200),
    europeanAncestry: z.string().min(1).max(300),
    dependants: z.string().min(1).max(200),
    timeline: z.string().min(1).max(200),
  })
  .superRefine((data, ctx) => {
    if (data.nationality !== "Other") return;
    const trimmed = (data.nationalityOther || "").trim();
    if (trimmed.length < 2 || !NATIONALITY_TEXT_PATTERN.test(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nationalityOther"],
        message: "Please provide a valid nationality (letters only, at least 2 characters).",
      });
    }
  });

// Keep this list identical to EU_NATIONALITY_KEYWORDS in public/app.js —
// the two have drifted out of sync before and caused a currency bug.
const EU_NATIONALITY_KEYWORDS = [
  "austria", "austrian", "osterreich", "österreich",
  "belgium", "belgian", "belgique", "belgie",
  "bulgaria", "bulgarian",
  "croatia", "croatian", "hrvatska",
  "cyprus", "cypriot",
  "czech", "czechia", "cesko", "česko",
  "denmark", "danish", "danmark",
  "netherlands", "dutch", "holland", "nederland",
  "estonia", "estonian", "eesti",
  "finland", "finnish", "suomi",
  "france", "french",
  "germany", "german", "deutschland", "deutsch",
  "greece", "greek", "hellas", "ellada",
  "hungary", "hungarian", "magyar",
  "ireland", "irish", "eire", "éire",
  "italy", "italian", "italia",
  "latvia", "latvian",
  "lithuania", "lithuanian",
  "luxembourg", "luxembourgish",
  "malta", "maltese",
  "poland", "polish", "polska",
  "portugal", "portuguese",
  "romania", "romanian",
  "slovakia", "slovak", "slovensko",
  "slovenia", "slovenian",
  "spain", "spanish", "espana", "españa",
  "sweden", "swedish", "sverige",
  "european union",
];

function isEuNationalityText(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  if (lower === "eu" || lower.startsWith("eu ") || lower.endsWith(" eu")) return true;
  return EU_NATIONALITY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function currencyFor(nationality, nationalityOther) {
  if (nationality === "British") return { code: "GBP", symbol: "£" };
  if (nationality === "Other" && isEuNationalityText(nationalityOther)) {
    return { code: "EUR", symbol: "€" };
  }
  return { code: "USD", symbol: "$" };
}

// Per-request behavioral rules derived from the client's exact answers.
// These live in the user prompt (not the cached system prompt) since they
// vary per submission and would otherwise fragment the prompt cache.
function buildConditionalConstraints(a) {
  const constraints = [];

  if (a.goal === "Obtain a second residency") {
    constraints.push(
      "The client's goal is to ADD a second residency, not to leave or relocate away from their home country. Frame every plan around gaining an additional residency option while keeping their home base — do not use language implying they are departing, emigrating, or giving up their current country, unless their other answers clearly indicate full relocation."
    );
  }

  if (a.incomeType === "Retired" || a.incomeType === "Unemployed") {
    constraints.push(
      "The client's income is pension, savings, or investment income, not active salary or business income. Prioritize passive-income-friendly routes (e.g. Portugal D7 Visa, Spain Non-Lucrative Visa) over employment- or business-based visa categories, and frame all financial requirements in terms of passive income or liquid net worth."
    );
  }

  if (a.dependants === "Just me") {
    constraints.push(
      "The client has no dependants and is relocating alone. Do not mention spouse visas, dependent/family visa pathways, school fees, or any other dependant-related costs or logistics anywhere in planA, planB, planC, keyInsight, or weeklyActions."
    );
  }

  if (a.europeanAncestry === "No") {
    constraints.push(
      "The client has confirmed they have NO European ancestry. Do not suggest, mention, or reference any citizenship-by-descent pathway (Irish, Italian, Polish, German, or any other ancestry-based citizenship route) in planA, planB, or planC."
    );
  }

  return constraints;
}

function appendLead(lead) {
  let leads = [];
  try {
    const raw = fs.readFileSync(LEADS_PATH, "utf-8");
    leads = JSON.parse(raw);
    if (!Array.isArray(leads)) leads = [];
  } catch {
    leads = [];
  }
  leads.push(lead);
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

function notifyNewLead(lead) {
  if (!resend) return;
  resend.emails
    .send({
      from: "noreply@bordersx.com",
      to: "kurran@bordersx.com",
      subject: "New BordersX Lead",
      text: [
        `Email: ${lead.email}`,
        `Nationality: ${lead.nationality}`,
        `Goal: ${lead.goal}`,
        `Income type: ${lead.income_type}`,
        `Income level: ${lead.income_level}`,
        `Mobility score: ${lead.mobility_score}`,
        `Timestamp: ${lead.timestamp}`,
      ].join("\n"),
    })
    .catch((err) => {
      console.error("[bordersx] Resend notification failed:", err.message);
    });
}

// keyFigure and insight are optional so an occasional omission degrades the
// results card (the frontend falls back) instead of failing the whole request.
const KeyFigureSchema = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(60),
});

const PlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  timeline: z.string(),
  estimatedCost: z.string(),
  keyFigure: KeyFigureSchema.optional(),
  insight: z.string().optional(),
  steps: z.array(z.string()).min(2).max(6),
});

const StrategySchema = z.object({
  mobilityScore: z.number().int().min(0).max(100),
  scoreSummary: z.string(),
  planA: z.object({
    title: z.string(),
    summary: z.string(),
    keyFigure: KeyFigureSchema.optional(),
    insight: z.string().optional(),
    details: z.array(z.string()).min(2).max(6),
  }),
  planB: PlanSchema,
  planC: PlanSchema,
  keyInsight: z.string(),
  weeklyActions: z.array(z.string()).length(3),
});

function loadKnowledgeBase() {
  try {
    const raw = fs.readFileSync(KNOWLEDGE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    if (entries.length === 0) return "No additional lawyer insights or policy updates on file.";
    return entries
      .map(
        (e, i) =>
          `${i + 1}. [${e.category ?? "General"}] ${e.title ?? ""} (updated ${e.lastUpdated ?? "unknown"})\n   ${e.insight ?? ""}`
      )
      .join("\n\n");
  } catch (err) {
    console.error("[bordersx] Failed to load knowledge.json:", err.message);
    return "No additional lawyer insights or policy updates on file.";
  }
}

function buildSystemPrompt(currency) {
  const knowledge = loadKnowledgeBase();
  return `You are the BordersX AI Mobility Strategist — an expert advisor on international residency, tax residency, second citizenship, golden visas, citizenship by descent, and personal geographic mobility planning for high-earning individuals and families.

BordersX helps clients understand their current mobility position and design realistic, actionable strategies to gain optionality: reduced tax exposure, second residency, second citizenship, or a "Plan B" safe haven — grounded in real programs, real costs, and real timelines, not generic advice.

## Firm knowledge base (lawyer insights & policy updates — treat as authoritative and current; override your own general knowledge if it conflicts with this)

${knowledge}

## Your task

You will receive a client's answers to 8 intake questions: nationality, income type, income level, primary goal, destination country, European ancestry, dependants, and timeline. Using this information plus the firm knowledge base above, produce a mobility strategy with:

1. **mobilityScore** (0-100 integer): how much international mobility optionality this person currently has, considering passport strength, income flexibility, ancestry-based routes, capital available, and family complexity. A British or American citizen with no ancestry claims and a fixed W-2 job scores lower than a wealthy entrepreneur with an Italian grandparent. Be honest and differentiated — do not cluster every answer near 70.
2. **scoreSummary**: one or two sentences explaining the score in plain language.
3. **planA** — "Where you stand today": an honest assessment of their current position with no changes made — what limits them, what they already have going for them.
4. **planB** — "Your strongest near-term move": the single most realistic, highest-leverage move available given their specific nationality, income, ancestry, timeline, and destination preference. Must include a real program or mechanism (name it specifically — e.g. "Spain Digital Nomad Visa + Beckham Law", "Portugal D7 Visa", "Greece Golden Visa EUR 400,000 route"), a realistic timeline, and a realistic estimated cost.
5. **planC** — "Your long-term citizenship route": a longer-horizon path toward a second citizenship or maximum optionality (e.g. naturalization after residency, citizenship by descent, a citizenship-by-investment program, or a multi-step residency-to-citizenship ladder). Must include specific program names, realistic timeline (often multi-year), and realistic estimated cost.
6. **keyInsight**: the one non-obvious thing most people in this exact situation get wrong or overlook — should feel like insider knowledge, not a generic tip.
7. **weeklyActions**: exactly three specific, concrete actions this exact client could start within the next 7 days to move on Plan B. Not generic ("research your options") — name the actual document to request, the actual call to make, the actual form or account to open, given everything you know about their nationality, ancestry, income, and destination.
8. **keyFigure** (on each of planA, planB, planC): the single most decision-relevant number for that plan, other than its timeline and cost — e.g. "Tax rate" / "20% flat (10 yrs)", "Min. stay" / "183 days/yr", "Visa-free access" / "190 countries", "Path to citizenship" / "10 yrs". "label" is 1-3 words; "value" is short (under ~25 characters) and must be specific to this client.
9. **insight** (on each of planA, planB, planC): one or two sentences — the non-obvious catch, trap, or advantage specific to that plan for this client. It must not repeat keyInsight or the plan's summary.

## Rules

- Be specific: name real countries, programs, visa categories, and approximate costs. Never say "consult an immigration lawyer" as a substitute for actual analysis — BordersX IS the analysis (a human lawyer follows up separately).
- Tailor everything to the exact combination of answers given — do not give generic answers that would apply to anyone.
- **Destination country**: if the client named a specific country (or typed their own), treat that as their strong preference — Plan B and, where sensible, Plan C should center on realistic routes into or via that country given their nationality, income, and goal. If they said "Not sure yet", do not default to any single country — instead recommend the 1-2 best-fit countries for their specific profile and explain briefly why those beat the alternatives.
- If the client claims European ancestry, seriously evaluate citizenship-by-descent as a candidate for Plan B or Plan C — it is often the highest-leverage option when genuinely available, even if it doesn't match their stated destination country (mention both if they diverge).
- If the client is American, always account for US worldwide taxation and, where relevant to their goal, the exit tax implications of any eventual renunciation.
- Costs and timelines must be realistic and current as of the knowledge base above.
- **Currency consistency**: the client's home currency is ${currency.code} (${currency.symbol}). State every cost figure — scoreSummary, planB.estimatedCost, planC.estimatedCost, and any cost mentioned in details/steps — primarily in ${currency.symbol}. Many programs are officially denominated in EUR or another local currency (e.g. a EUR 500,000 Portuguese fund) — when that's the case, convert to an approximate ${currency.symbol} figure using a reasonable current exchange rate as the primary number, and you may add the original EUR/local figure in parentheses for precision (e.g. "${currency.symbol}430,000 (approx. EUR 500,000)"). Never state a cost in a currency other than ${currency.symbol} without also giving the ${currency.symbol} equivalent.
- Keep tone professional, direct, and confident — like a strategist who has done this hundreds of times, not a chatbot hedging with disclaimers.
- Write in the voice of a senior private client advisor, not an AI assistant. Use confident, direct sentences. Lead every plan summary with the verdict first, then the reasoning.
- Never use: "it may be worth", "you might want to", "consider exploring", "it's important to note", "based on your inputs". Replace with direct statements.
- Plan summaries must open with a one-sentence verdict: what this plan achieves and why it fits this client specifically.
- steps and details must be imperative and concrete: "Apply for NHR2 (IFICI) within your first year of Portuguese residency" not "You should look into registering".
- keyInsight must feel like insider knowledge a client wouldn't find on Google — a specific trap, timing advantage, or non-obvious edge case.
- weeklyActions must be specific enough that the client can complete them without Googling what to do next — name the actual form, portal, document or person to contact.

## Output format

Respond with ONLY a single valid JSON object — no markdown fences, no commentary before or after. It must match exactly this shape:

{
  "mobilityScore": <integer 0-100>,
  "scoreSummary": "<1-2 sentences>",
  "planA": {
    "title": "<short title>",
    "summary": "<1-3 sentences>",
    "keyFigure": { "label": "<1-3 words>", "value": "<short figure>" },
    "insight": "<1-2 sentences specific to this plan>",
    "details": ["<point>", "<point>", "..."]
  },
  "planB": {
    "title": "<short title, name the specific program/mechanism>",
    "summary": "<1-3 sentences>",
    "timeline": "<realistic timeline>",
    "estimatedCost": "<realistic cost in USD or EUR>",
    "keyFigure": { "label": "<1-3 words>", "value": "<short figure>" },
    "insight": "<1-2 sentences specific to this plan>",
    "steps": ["<step>", "<step>", "..."]
  },
  "planC": {
    "title": "<short title, name the specific program/mechanism>",
    "summary": "<1-3 sentences>",
    "timeline": "<realistic timeline, often multi-year>",
    "estimatedCost": "<realistic cost in USD or EUR>",
    "keyFigure": { "label": "<1-3 words>", "value": "<short figure>" },
    "insight": "<1-2 sentences specific to this plan>",
    "steps": ["<step>", "<step>", "..."]
  },
  "keyInsight": "<the one thing most people miss>",
  "weeklyActions": ["<concrete action for day 1-7>", "<concrete action for day 1-7>", "<concrete action for day 1-7>"]
}

"weeklyActions" must contain exactly 3 items.

"details" and "steps" arrays must each contain between 2 and 6 short items.

Produce the JSON exactly once, start to finish, with no draft, no preamble, and no repetition of any part of it.`;
}

// The model occasionally emits a short "preview" JSON object before the real,
// complete one. Return every top-level balanced {...} span found, in order,
// so the caller can pick the one that actually matches the expected schema.
function extractJsonCandidates(text) {
  const candidates = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break; // unterminated tail — stop scanning
    try {
      candidates.push(JSON.parse(text.slice(start, end + 1)));
    } catch {
      // not valid JSON on its own (e.g. a brace inside prose) — skip it
    }
    i = end + 1;
  }
  return candidates;
}

app.post("/api/analyze", async (req, res) => {
  const parsedAnswers = AnswersSchema.safeParse(req.body);
  if (!parsedAnswers.success) {
    return res.status(400).json({ error: "Invalid submission.", details: parsedAnswers.error.flatten() });
  }
  const a = parsedAnswers.data;
  const currency = currencyFor(a.nationality, a.nationalityOther);
  const constraints = buildConditionalConstraints(a);

  const userPrompt = `Client intake:
- Nationality: ${a.nationality}${a.nationalityOther ? ` (${a.nationalityOther})` : ""}
- Home currency: ${currency.code} (${currency.symbol})
- Income type: ${a.incomeType}
- Income level: ${a.incomeLevel}
- Primary goal: ${a.goal}
- Destination country of interest: ${a.destinationCountry}
- European ancestry: ${a.europeanAncestry}
- Dependants: ${a.dependants}
- Timeline: ${a.timeline}
${constraints.length > 0 ? `\nMandatory constraints for this specific client:\n${constraints.map((c) => `- ${c}`).join("\n")}\n` : ""}
Produce the full BordersX mobility strategy for this client now. Remember: all cost figures in ${currency.symbol}.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: buildSystemPrompt(currency), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      return res.status(502).json({ error: "The strategist could not produce a result. Please try again." });
    }

    const candidates = extractJsonCandidates(textBlock.text);
    if (candidates.length === 0) {
      console.error("[bordersx] No JSON object found. stop_reason:", response.stop_reason);
      return res.status(502).json({ error: "The strategist returned an unreadable result. Please try again." });
    }

    // Prefer the last candidate that validates — earlier ones are sometimes
    // an incomplete preview the model emitted before the full object.
    let parsedResult = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const attempt = StrategySchema.safeParse(candidates[i]);
      if (attempt.success) {
        parsedResult = attempt;
        break;
      }
    }

    if (!parsedResult) {
      const lastAttempt = StrategySchema.safeParse(candidates[candidates.length - 1]);
      console.error("[bordersx] Schema validation failed for all candidates:", lastAttempt.error?.flatten());
      return res.status(502).json({ error: "The strategist's result didn't match the expected format. Please try again." });
    }

    try {
      const lead = {
        email: a.email,
        nationality: a.nationality === "Other" && a.nationalityOther ? a.nationalityOther : a.nationality,
        income_type: a.incomeType,
        income_level: a.incomeLevel,
        goal: a.goal,
        ancestry: a.europeanAncestry,
        dependants: a.dependants,
        timeline: a.timeline,
        mobility_score: parsedResult.data.mobilityScore,
        timestamp: new Date().toISOString(),
      };
      appendLead(lead);
      notifyNewLead(lead); // fire-and-forget, not awaited
    } catch (leadErr) {
      console.error("[bordersx] Failed to save lead to leads.json:", leadErr.message);
    }

    res.json({ result: parsedResult.data });
  } catch (err) {
    console.error("[bordersx] Anthropic API error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "Server is not configured correctly (invalid API key)." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "We're experiencing high demand — please try again in a moment." });
    }
    return res.status(500).json({ error: "Something went wrong generating your strategy. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`BordersX running at http://localhost:${PORT}`);
});
