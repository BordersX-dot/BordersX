(() => {
  const ALL_QUESTION_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];
  const ANCESTRY_QUESTION_INDEX = 5;

  // Keep this list identical to EU_NATIONALITY_KEYWORDS in server.js —
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

  // Letters (incl. accented), spaces, hyphens, apostrophes — covers things
  // like "Bosnian-Herzegovinian" or "Côte d'Ivoire" adjectives.
  const NATIONALITY_TEXT_PATTERN = /^[\p{L}\s'-]+$/u;

  function nationalityTextIssue(text) {
    const trimmed = (text || "").trim();
    if (trimmed.length < 2) return "Please enter your nationality (at least 2 letters).";
    if (!NATIONALITY_TEXT_PATTERN.test(trimmed)) return "Please use letters only (no numbers or symbols).";
    return null;
  }

  const CURRENCY_BY_NATIONALITY = {
    British: {
      tiers: ["Under £50,000", "£50,000 – £150,000", "£150,000 – £500,000", "Over £500,000"],
    },
    American: {
      tiers: ["Under $50,000", "$50,000 – $150,000", "$150,000 – $500,000", "Over $500,000"],
    },
    EU: {
      tiers: ["Under €50,000", "€50,000 – €150,000", "€150,000 – €500,000", "Over €500,000"],
    },
  };

  // For retired/unemployed clients, the question is about pension, savings
  // and investment income (or liquid net worth) rather than a salary band.
  const PASSIVE_INCOME_TIERS_BY_CURRENCY = {
    British: {
      tiers: [
        "Under £25,000 (pension / savings / investment income)",
        "£25,000 – £75,000 (pension / savings / investment income)",
        "£75,000 – £250,000 (pension / savings / investment income)",
        "Over £250,000 (pension / savings / investment income)",
      ],
    },
    American: {
      tiers: [
        "Under $25,000 (pension / savings / investment income)",
        "$25,000 – $75,000 (pension / savings / investment income)",
        "$75,000 – $250,000 (pension / savings / investment income)",
        "Over $250,000 (pension / savings / investment income)",
      ],
    },
    EU: {
      tiers: [
        "Under €25,000 (pension / savings / investment income)",
        "€25,000 – €75,000 (pension / savings / investment income)",
        "€75,000 – €250,000 (pension / savings / investment income)",
        "Over €250,000 (pension / savings / investment income)",
      ],
    },
  };

  const PASSIVE_INCOME_TYPES = ["Retired", "Unemployed"];

  const state = {
    step: 0,
    answers: {
      nationality: "",
      nationalityOther: "",
      incomeType: "",
      incomeLevel: "",
      goal: "",
      destinationCountry: "",
      destinationCountryOther: "",
      europeanAncestry: "",
      europeanAncestryDetail: "",
      dependants: "",
      timeline: "",
    },
    email: "",
  };

  function isEuNational() {
    if (state.answers.nationality !== "Other") return false;
    return isEuNationalityText(state.answers.nationalityOther);
  }

  // EU nationals already hold an EU passport, so the "European ancestry"
  // question is redundant for them — skip it from the visible flow.
  function visibleStepIndices() {
    return isEuNational()
      ? ALL_QUESTION_INDICES.filter((i) => i !== ANCESTRY_QUESTION_INDEX)
      : ALL_QUESTION_INDICES;
  }

  const screens = {
    intro: document.getElementById("screen-intro"),
    quiz: document.getElementById("screen-quiz"),
    email: document.getElementById("screen-email"),
    loading: document.getElementById("screen-loading"),
    error: document.getElementById("screen-error"),
    results: document.getElementById("screen-results"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => (el.hidden = true));
    screens[name].hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const quizForm = document.getElementById("quiz-form");
  const questions = Array.from(document.querySelectorAll(".q"));
  const btnNext = document.getElementById("btn-next");
  const btnBack = document.getElementById("btn-back");
  const progressFill = document.getElementById("progress-fill");
  const stepCount = document.getElementById("step-count");

  const nationalityOtherInput = document.getElementById("nationalityOther");
  const nationalityHint = document.getElementById("nationalityHint");
  const ancestryDetailInput = document.getElementById("ancestryDetail");
  const destinationOtherInput = document.getElementById("destinationOther");
  const incomeLevelOptions = document.getElementById("incomeLevel-options");
  const incomeLevelHeading = document.getElementById("incomeLevel-heading");

  // Live, visible feedback on how free-text nationality maps to currency/region —
  // so a mismatch (e.g. a native-language spelling we don't recognize) is caught
  // here instead of silently producing the wrong currency in the results.
  function renderNationalityHint() {
    const text = state.answers.nationalityOther;
    if (!text.trim()) {
      nationalityHint.hidden = true;
      return;
    }
    const issue = nationalityTextIssue(text);
    nationalityHint.hidden = false;
    if (issue) {
      nationalityHint.textContent = issue;
      nationalityHint.className = "field-hint field-hint-error";
      return;
    }
    if (isEuNationalityText(text)) {
      nationalityHint.textContent = "Recognized as an EU nationality — costs will be shown in euros (€).";
    } else {
      nationalityHint.textContent = "We'll treat this as a non-EU nationality — costs will be shown in US dollars ($).";
    }
    nationalityHint.className = "field-hint field-hint-info";
  }

  function renderIncomeOptions() {
    const currencyKey = state.answers.nationality === "British"
      ? "British"
      : isEuNational()
        ? "EU"
        : "American"; // USD tiers — American, and any non-EU "Other" nationality
    const isPassiveIncome = PASSIVE_INCOME_TYPES.includes(state.answers.incomeType);
    const config = isPassiveIncome
      ? PASSIVE_INCOME_TIERS_BY_CURRENCY[currencyKey]
      : CURRENCY_BY_NATIONALITY[currencyKey];
    incomeLevelHeading.textContent = isPassiveIncome
      ? "What is your approximate annual income from pensions, savings or investments, or your liquid net worth?"
      : "What is your approximate annual income or liquid net worth?";
    const previousValue = state.answers.incomeLevel;
    incomeLevelOptions.innerHTML = "";
    config.tiers.forEach((tier, i) => {
      const label = document.createElement("label");
      label.className = "opt";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "incomeLevel";
      input.value = tier;
      if (i === 0) input.required = true;
      if (tier === previousValue) input.checked = true;
      const span = document.createElement("span");
      span.textContent = tier;
      label.appendChild(input);
      label.appendChild(span);
      incomeLevelOptions.appendChild(label);
    });
    if (!config.tiers.includes(previousValue)) {
      state.answers.incomeLevel = "";
    }
  }

  document.getElementById("btn-start").addEventListener("click", () => {
    state.step = 0;
    renderIncomeOptions();
    renderStep();
    showScreen("quiz");
  });

  quizForm.addEventListener("change", (e) => {
    const name = e.target.name;
    if (!name) return;
    state.answers[name] = e.target.value;

    if (name === "nationality") {
      nationalityOtherInput.hidden = e.target.value !== "Other";
      if (e.target.value !== "Other") {
        nationalityOtherInput.value = "";
        state.answers.nationalityOther = "";
        nationalityHint.hidden = true;
      } else {
        renderNationalityHint();
      }
      renderIncomeOptions();
    }
    if (name === "incomeType") {
      renderIncomeOptions(); // tier set depends on retired/unemployed status
    }
    if (name === "europeanAncestry") {
      ancestryDetailInput.hidden = e.target.value !== "Yes";
      if (e.target.value !== "Yes") ancestryDetailInput.value = "";
    }
    if (name === "destinationCountry") {
      destinationOtherInput.hidden = e.target.value !== "Somewhere else";
      if (e.target.value !== "Somewhere else") destinationOtherInput.value = "";
    }
    updateNextEnabled();
  });

  nationalityOtherInput.addEventListener("input", (e) => {
    state.answers.nationalityOther = e.target.value;
    renderNationalityHint();
    renderIncomeOptions(); // EU detection depends on this text, not just the radio
    updateNextEnabled();
  });
  ancestryDetailInput.addEventListener("input", (e) => {
    state.answers.europeanAncestryDetail = e.target.value;
  });
  destinationOtherInput.addEventListener("input", (e) => {
    state.answers.destinationCountryOther = e.target.value;
    updateNextEnabled();
  });

  function currentQuestionAnswered() {
    const actualIndex = visibleStepIndices()[state.step];
    const q = questions[actualIndex];
    const name = q.querySelector("input[name]")?.name;
    if (!name) return true;
    const checked = q.querySelector(`input[name="${name}"]:checked`);
    if (!checked) return false;
    if (name === "nationality" && checked.value === "Other") {
      return nationalityTextIssue(state.answers.nationalityOther) === null;
    }
    if (name === "destinationCountry" && checked.value === "Somewhere else") {
      return state.answers.destinationCountryOther.trim().length > 0;
    }
    return true;
  }

  function updateNextEnabled() {
    btnNext.disabled = !currentQuestionAnswered();
  }

  function renderStep() {
    renderIncomeOptions(); // keep tiers in sync in case nationality changed via back-navigation
    const visible = visibleStepIndices();
    const actualIndex = visible[state.step];
    const total = visible.length;
    questions.forEach((q, i) => (q.hidden = i !== actualIndex));
    btnBack.hidden = state.step === 0;
    progressFill.style.width = `${((state.step + 1) / total) * 100}%`;
    stepCount.textContent = `Question ${state.step + 1} of ${total}`;
    btnNext.textContent = state.step === total - 1 ? "Continue" : "Next";
    updateNextEnabled();
  }

  btnNext.addEventListener("click", () => {
    if (!currentQuestionAnswered()) return;
    const total = visibleStepIndices().length;
    if (state.step < total - 1) {
      state.step += 1;
      renderStep();
    } else {
      showScreen("email");
    }
  });

  btnBack.addEventListener("click", () => {
    if (state.step > 0) {
      state.step -= 1;
      renderStep();
    }
  });

  document.getElementById("btn-back-email").addEventListener("click", () => {
    state.step = visibleStepIndices().length - 1;
    renderStep();
    showScreen("quiz");
  });

  document.getElementById("email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("email-input");
    state.email = emailInput.value.trim();
    if (!state.email) return;
    await submitAnalysis();
  });

  document.getElementById("btn-retry").addEventListener("click", async () => {
    await submitAnalysis();
  });

  document.getElementById("btn-restart").addEventListener("click", () => {
    state.step = 0;
    state.answers = {
      nationality: "", nationalityOther: "", incomeType: "", incomeLevel: "",
      goal: "", destinationCountry: "", destinationCountryOther: "",
      europeanAncestry: "", europeanAncestryDetail: "", dependants: "", timeline: "",
    };
    state.email = "";
    quizForm.reset();
    nationalityOtherInput.hidden = true;
    nationalityHint.hidden = true;
    ancestryDetailInput.hidden = true;
    destinationOtherInput.hidden = true;
    incomeLevelOptions.innerHTML = "";
    document.getElementById("email-input").value = "";
    renderStep();
    showScreen("intro");
  });

  async function submitAnalysis() {
    showScreen("loading");
    const europeanAncestryCombined = isEuNational()
      ? `Not applicable — already holds EU nationality (${state.answers.nationalityOther})`
      : state.answers.europeanAncestryDetail
        ? `${state.answers.europeanAncestry} — ${state.answers.europeanAncestryDetail}`
        : state.answers.europeanAncestry;
    const destinationCountryCombined =
      state.answers.destinationCountry === "Somewhere else"
        ? state.answers.destinationCountryOther
        : state.answers.destinationCountry;

    const payload = {
      email: state.email,
      nationality: state.answers.nationality,
      nationalityOther: state.answers.nationalityOther || undefined,
      incomeType: state.answers.incomeType,
      incomeLevel: state.answers.incomeLevel,
      goal: state.answers.goal,
      destinationCountry: destinationCountryCombined,
      europeanAncestry: europeanAncestryCombined,
      dependants: state.answers.dependants,
      timeline: state.answers.timeline,
    };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unknown error");
      }
      renderResults(data.result);
      showScreen("results");
    } catch (err) {
      document.getElementById("error-message").textContent =
        err.message || "We couldn't generate your strategy. Please try again.";
      showScreen("error");
    }
  }

  // Short, readable chips summarising the answers the strategy was built on.
  function profileTags() {
    const a = state.answers;
    const nationality = a.nationality === "Other" ? a.nationalityOther.trim() : a.nationality;
    const destination =
      a.destinationCountry === "Somewhere else" ? a.destinationCountryOther.trim() : a.destinationCountry;
    return [
      nationality && `${nationality} passport`,
      a.incomeType,
      a.incomeLevel.replace(/\s*\(.*\)\s*$/, ""), // drop the "(pension / savings …)" suffix
      a.goal,
      destination && destination !== "Not sure yet" && `Destination: ${destination}`,
      a.dependants,
      a.timeline,
    ].filter(Boolean);
  }

  function renderProfileTags() {
    const el = document.getElementById("profile-tags");
    el.innerHTML = "";
    profileTags().forEach((text) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = text;
      el.appendChild(span);
    });
  }

  function stepsLabel(steps) {
    const n = (steps || []).length;
    return `View ${n} step${n === 1 ? "" : "s"}`;
  }

  // Third metric + insight box on each plan card. Both fields are optional in
  // the server schema, so fall back to a derived figure / hide the box.
  function renderPlanExtras(prefix, plan, fallbackFigure) {
    const figure = plan.keyFigure || fallbackFigure;
    document.getElementById(`${prefix}-figure-label`).textContent = figure.label;
    document.getElementById(`${prefix}-figure`).textContent = figure.value;
    document.getElementById(`${prefix}-insight`).textContent = plan.insight || "";
    document.getElementById(`${prefix}-insight-box`).hidden = !plan.insight;
  }

  function renderResults(result) {
    renderProfileTags();

    const score = Math.max(0, Math.min(100, Math.round(result.mobilityScore)));
    document.getElementById("score-number").textContent = score;
    document.getElementById("score-summary").textContent = result.scoreSummary;

    const circumference = 326.7;
    const offset = circumference - (score / 100) * circumference;
    const ring = document.getElementById("score-ring-fg");
    ring.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = offset;
    });

    document.getElementById("planA-title").textContent = result.planA.title;
    document.getElementById("planA-summary").textContent = result.planA.summary;
    fillList("planA-details", result.planA.details);
    renderPlanExtras("planA", result.planA, { label: "Mobility score", value: `${score} / 100` });

    document.getElementById("planB-title").textContent = result.planB.title;
    document.getElementById("planB-summary").textContent = result.planB.summary;
    document.getElementById("planB-timeline").textContent = result.planB.timeline;
    document.getElementById("planB-cost").textContent = result.planB.estimatedCost;
    fillList("planB-steps", result.planB.steps);
    document.getElementById("planB-steps-toggle").textContent = stepsLabel(result.planB.steps);
    const actionCount = (result.weeklyActions || []).length;
    renderPlanExtras("planB", result.planB, { label: "This week", value: `${actionCount} action${actionCount === 1 ? "" : "s"}` });

    document.getElementById("planC-title").textContent = result.planC.title;
    document.getElementById("planC-summary").textContent = result.planC.summary;
    document.getElementById("planC-timeline").textContent = result.planC.timeline;
    document.getElementById("planC-cost").textContent = result.planC.estimatedCost;
    fillList("planC-steps", result.planC.steps);
    document.getElementById("planC-steps-toggle").textContent = stepsLabel(result.planC.steps);
    renderPlanExtras("planC", result.planC, { label: "Route", value: `${(result.planC.steps || []).length} steps` });

    document.getElementById("key-insight").textContent = result.keyInsight;

    fillList("weekly-actions", result.weeklyActions);
  }

  function fillList(id, items) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      el.appendChild(li);
    });
  }

  renderStep();
})();
