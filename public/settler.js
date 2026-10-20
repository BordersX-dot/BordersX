// Settler: personalised relocation checklist. Two ways in:
//   - after an Explorer analysis — app.js calls Settler.setup() with the results
//   - straight from the homepage — the picker screen asks for country + 3 quick answers
// Content lives in settler-data.js.
(() => {
  const { AFFILIATES, PHASES, COUNTRIES } = window.BX_SETTLER_DATA;
  const PASSIVE_INCOME_TYPES = ["Retired", "Unemployed", "Investment / passive income"];
  const STORAGE_PREFIX = "bx-settler:";
  const PROGRESS_KEY = "bordersx_settler_progress";
  const BANNER_DISMISSED_KEY = "bordersx_banner_dismissed";
  const SAVE_HOOK_URL = "https://hooks.zapier.com/hooks/catch/29005760/41l1km7/";
  const SAVE_CARD_MIN_DONE = 3;

  let ctx = null;
  let current = null; // { key, steps }
  let returnTo = "results"; // screen the checklist back-link goes to
  let planLabels = {}; // country key → "Plan B · <title>" for countries a plan named
  let basisText = "";

  const choicesEl = document.getElementById("settler-choices");
  const pickerForm = document.getElementById("settler-picker-form");
  const pickerSubmit = document.getElementById("btn-picker-submit");
  const backLink = document.getElementById("btn-settler-back");
  const phasesEl = document.getElementById("settler-phases");
  const moveDateInput = document.getElementById("settler-move-date");
  const saveCard = document.getElementById("save-card");
  const saveForm = document.getElementById("save-form");
  const saveStatus = document.getElementById("save-status");
  const resumeBanner = document.getElementById("resume-banner");

  // Done-state and move date are per-browser conveniences, so a blocked or
  // empty localStorage just means starting fresh.
  function loadSaved(key) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key));
      return { done: Array.isArray(saved?.done) ? saved.done : [], moveDate: saved?.moveDate || "" };
    } catch {
      return { done: [], moveDate: "" };
    }
  }

  function save(key, data) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
    } catch {
      // storage unavailable — progress just won't survive a reload
    }
  }

  // The most recent checklist with progress, so the homepage can offer to resume it.
  // ctx and basis are kept so the resumed checklist shows the same steps.
  function saveProgress(completedItems) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        country: current.key,
        visaType: COUNTRIES[current.key].tagline,
        completedItems,
        savedAt: new Date().toISOString(),
        ctx,
        basis: basisText,
      }));
    } catch {
      // storage unavailable — no resume banner
    }
  }

  function loadProgress() {
    try {
      const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      if (!COUNTRIES[progress?.country] || !progress.completedItems?.length) return null;
      return progress;
    } catch {
      return null;
    }
  }

  function bannerDismissed() {
    try {
      return sessionStorage.getItem(BANNER_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function refreshResumeBanner() {
    const progress = loadProgress();
    resumeBanner.hidden = !progress || bannerDismissed();
    if (progress) {
      document.getElementById("resume-link").textContent =
        `Welcome back — continue your ${displayName(progress.country)} checklist →`;
    }
  }

  const displayName = (key) => COUNTRIES[key].name.replace(/^the /, "The ");

  const resolve = (value) => (typeof value === "function" ? value(ctx) : value);

  // The country a plan is about = the supported country named earliest in its
  // title (falling back to the summary), so "UAE Golden Visa + Malta…" → UAE.
  function detectCountry(plan) {
    for (const text of [plan.title, plan.summary]) {
      const lower = (text || "").toLowerCase();
      let best = null;
      for (const [key, country] of Object.entries(COUNTRIES)) {
        for (const word of country.keywords) {
          const i = lower.search(new RegExp(`\\b${word}\\b`));
          if (i !== -1 && (!best || i < best.index)) best = { key, index: i };
        }
      }
      if (best) return best.key;
    }
    return null;
  }

  function setup(result, profile) {
    ctx = {
      eu: profile.eu,
      british: profile.nationality === "British",
      american: profile.nationality === "American",
      family: profile.dependants !== "Just me",
      passive: PASSIVE_INCOME_TYPES.includes(profile.incomeType),
    };

    const options = [];
    planLabels = {};
    [["B", result.planB], ["C", result.planC], ["A", result.planA]].forEach(([letter, plan]) => {
      const key = detectCountry(plan);
      if (key && !options.some((o) => o.key === key)) {
        planLabels[key] = `Plan ${letter} · ${plan.title}`;
        options.push({ key, sub: planLabels[key] });
      }
    });
    Object.keys(COUNTRIES).forEach((key) => {
      if (!options.some((o) => o.key === key)) options.push({ key, sub: COUNTRIES[key].tagline });
    });

    choicesEl.innerHTML = "";
    options.forEach((option) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "settler-choice";
      card.dataset.key = option.key;
      const name = document.createElement("strong");
      name.textContent = displayName(option.key);
      const sub = document.createElement("span");
      sub.textContent = option.sub;
      card.append(name, sub);
      choicesEl.appendChild(card);
    });
  }

  function formatDeadline(days) {
    if (days < 0) {
      const before = -days;
      return before < 14 ? `${before} days before arrival` : `${Math.round(before / 7)} weeks before arrival`;
    }
    if (days === 0) return "On arrival";
    if (days <= 90) return `Within ${days} days of arrival`;
    return `Within ${Math.round(days / 30)} months of arrival`;
  }

  function deadlineDate(moveDate, days) {
    if (!moveDate) return null;
    const date = new Date(`${moveDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + days);
    return date;
  }

  function open(key, { basis, from }) {
    const country = COUNTRIES[key];
    const steps = country.steps
      .filter((s) => !s.when || s.when(ctx))
      .map((s) => ({ ...s, title: resolve(s.title), body: resolve(s.body) }))
      .sort((a, b) => a.days - b.days);
    if (current?.key !== key) resetSaveCard();
    current = { key, steps };
    basisText = basis;

    document.getElementById("settler-title").textContent = `Your move to ${country.name}`;
    document.getElementById("settler-basis").textContent = basis;
    returnTo = from;
    backLink.textContent = {
      results: "← Back to your results",
      settlerPicker: "← Change country or answers",
    }[from] || "← Back";
    moveDateInput.value = loadSaved(key).moveDate;

    render();
    window.BordersX.showScreen("settler");
  }

  function render() {
    const saved = loadSaved(current.key);
    const done = new Set(saved.done);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    phasesEl.innerHTML = "";

    PHASES.forEach((phase) => {
      const steps = current.steps.filter((s) => PHASES.find((p) => p.test(s.days)) === phase);
      if (steps.length === 0) return;

      const section = document.createElement("section");
      section.className = "settler-phase";
      section.dataset.phase = phase.key;
      const header = document.createElement("div");
      header.className = "settler-phase-header";
      const h2 = document.createElement("h2");
      h2.textContent = phase.name;
      const count = document.createElement("span");
      count.className = "settler-phase-count";
      header.append(h2, count);

      const list = document.createElement("ol");
      list.className = "settler-steps";
      steps.forEach((step) => {
        const li = document.createElement("li");
        li.className = "settler-step";
        li.classList.toggle("is-done", done.has(step.id));

        const top = document.createElement("div");
        top.className = "settler-step-top";
        const title = document.createElement("h3");
        title.textContent = step.title;
        const due = document.createElement("span");
        due.className = "settler-due";
        const date = deadlineDate(saved.moveDate, step.days);
        due.textContent = date
          ? `${formatDeadline(step.days)} · ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
          : formatDeadline(step.days);
        if (date && date < today) due.classList.add("is-overdue");
        top.append(title, due);

        const body = document.createElement("p");
        body.textContent = step.body;

        const footer = document.createElement("div");
        footer.className = "settler-step-footer";
        const links = document.createElement("div");
        links.className = "settler-links";
        (step.links || []).forEach((linkKey) => {
          const aff = AFFILIATES[linkKey];
          const a = document.createElement("a");
          a.className = "settler-link";
          a.href = aff.url;
          a.target = "_blank";
          a.rel = "sponsored noopener noreferrer";
          a.textContent = `${aff.label} →`;
          links.appendChild(a);
        });
        const check = document.createElement("label");
        check.className = "settler-check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = done.has(step.id);
        box.dataset.step = step.id;
        const checkText = document.createElement("span");
        checkText.textContent = box.checked ? "Done" : "Mark as done";
        check.append(box, checkText);
        footer.append(links, check);

        const tips = (step.tips || []).filter((t) => !t.when || t.when(ctx)).map((t) => {
          const tip = document.createElement("p");
          tip.className = "settler-tip";
          tip.textContent = t.text;
          return tip;
        });

        li.append(top, body, ...tips, footer);
        list.appendChild(li);
      });

      section.append(header, list);
      phasesEl.appendChild(section);
    });

    updateProgress();
  }

  // The save card sits after the first fully ticked-off phase (or the first
  // phase until one is), once enough steps are done to be worth keeping.
  function placeSaveCard(complete) {
    saveCard.hidden = complete < SAVE_CARD_MIN_DONE;
    if (saveCard.hidden) return;
    const sections = [...phasesEl.querySelectorAll(".settler-phase")];
    const anchor = sections.find((s) => !s.querySelector("input[type=checkbox]:not(:checked)")) || sections[0];
    if (anchor && anchor.nextElementSibling !== saveCard) anchor.after(saveCard);
  }

  function resetSaveCard() {
    saveForm.hidden = false;
    saveStatus.textContent = "";
    saveStatus.classList.remove("is-error");
  }

  function updateProgress() {
    const done = new Set(loadSaved(current.key).done);
    const total = current.steps.length;
    const complete = current.steps.filter((s) => done.has(s.id)).length;
    const pct = total ? Math.round((complete / total) * 100) : 0;
    document.getElementById("settler-progress-label").textContent = `${complete} of ${total} steps done`;
    document.getElementById("settler-progress-pct").textContent = `${pct}%`;
    document.getElementById("settler-progress-fill").style.width = `${pct}%`;
    document.getElementById("settler-progress").setAttribute("aria-valuenow", pct);

    phasesEl.querySelectorAll(".settler-phase").forEach((section) => {
      const boxes = section.querySelectorAll("input[type=checkbox]");
      const checked = section.querySelectorAll("input[type=checkbox]:checked").length;
      section.querySelector(".settler-phase-count").textContent = `${checked}/${boxes.length}`;
    });
    placeSaveCard(complete);
  }

  phasesEl.addEventListener("change", (e) => {
    const box = e.target;
    if (!box.dataset.step) return;
    const saved = loadSaved(current.key);
    const done = new Set(saved.done);
    if (box.checked) done.add(box.dataset.step);
    else done.delete(box.dataset.step);
    save(current.key, { ...saved, done: [...done] });
    saveProgress([...done]);
    box.closest(".settler-step").classList.toggle("is-done", box.checked);
    box.nextElementSibling.textContent = box.checked ? "Done" : "Mark as done";
    updateProgress();
  });

  moveDateInput.addEventListener("change", () => {
    save(current.key, { ...loadSaved(current.key), moveDate: moveDateInput.value });
    render();
  });

  const openFromResults = (key) => {
    open(key, {
      basis: planLabels[key] ? `Built for ${planLabels[key]}` : "Built from your answers",
      from: "results",
    });
  };
  // Each country card opens its checklist directly; the Step 2 card opens the
  // first one (the country your plans point to, when any do).
  choicesEl.addEventListener("click", (e) => {
    const card = e.target.closest(".settler-choice");
    if (card) openFromResults(card.dataset.key);
  });
  document.getElementById("btn-settler-card").addEventListener("click", () => {
    const first = choicesEl.querySelector(".settler-choice");
    if (first) openFromResults(first.dataset.key);
  });

  saveForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = document.getElementById("save-submit");
    const done = new Set(loadSaved(current.key).done);
    submit.disabled = true;
    saveStatus.textContent = "";
    saveStatus.classList.remove("is-error");
    try {
      // Sent as text/plain: Zapier parses the JSON body either way, and a
      // simple request skips the CORS preflight its hooks don't answer.
      const res = await fetch(SAVE_HOOK_URL, {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("save-email").value.trim(),
          country: current.key,
          visaType: COUNTRIES[current.key].tagline,
          completedCount: current.steps.filter((s) => done.has(s.id)).length,
          savedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveForm.hidden = true;
      saveStatus.textContent = "Saved — check your inbox";
    } catch {
      saveStatus.textContent = "Something went wrong — try again";
      saveStatus.classList.add("is-error");
    } finally {
      submit.disabled = false;
    }
  });

  // ── Homepage resume banner ──

  document.getElementById("resume-link").addEventListener("click", () => {
    const progress = loadProgress();
    if (!progress) return;
    ctx = progress.ctx || {};
    open(progress.country, { basis: progress.basis || "", from: "intro" });
  });

  document.getElementById("resume-dismiss").addEventListener("click", () => {
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
    } catch {
      // can't remember the dismissal — just hide it for now
    }
    resumeBanner.hidden = true;
  });

  backLink.addEventListener("click", () => {
    window.BordersX.showScreen(returnTo);
  });

  // ── Direct entry: homepage → picker → checklist ──

  const PASSPORT_LABELS = { British: "British", American: "American", EU: "EU", Other: "non-EU" };

  function renderPickerCountries() {
    const el = document.getElementById("picker-countries");
    Object.entries(COUNTRIES).forEach(([key, country]) => {
      const label = document.createElement("label");
      label.className = "settler-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "pickerCountry";
      input.value = key;
      input.required = true;
      const name = document.createElement("strong");
      name.textContent = displayName(key);
      const sub = document.createElement("span");
      sub.textContent = country.tagline;
      label.append(input, name, sub);
      el.appendChild(label);
    });
  }

  function pickerValues() {
    const data = new FormData(pickerForm);
    return {
      country: data.get("pickerCountry"),
      passport: data.get("pickerPassport"),
      family: data.get("pickerFamily") === "family",
      passive: data.get("pickerIncome") === "passive",
    };
  }

  pickerForm.addEventListener("change", () => {
    const v = pickerValues();
    pickerSubmit.disabled = !(v.country && v.passport);
  });

  pickerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = pickerValues();
    if (!v.country || !v.passport) return;
    ctx = {
      eu: v.passport === "EU",
      british: v.passport === "British",
      american: v.passport === "American",
      family: v.family,
      passive: v.passive,
    };
    open(v.country, {
      basis: [
        `${PASSPORT_LABELS[v.passport]} passport`,
        v.family ? "Moving with family" : "Moving alone",
        v.passive ? "Pension, savings or investment income" : "Working income",
      ].join(" · "),
      from: "settlerPicker",
    });
  });

  renderPickerCountries();
  refreshResumeBanner();

  window.Settler = { setup, refreshResumeBanner };
})();
