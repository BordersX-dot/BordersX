// Settler checklist content. Edit freely — no build step.
//
// Each step:
//   id     stable key (used to remember "done" state — don't rename once live)
//   days   deadline relative to arrival day (negative = before you leave);
//          also decides the phase: <0 Before You Leave, ≤30 First 30 Days,
//          ≤90 First 90 Days, otherwise First Year
//   title  / body  string, or (ctx) => string for personalised wording
//   when   optional (ctx) => boolean — step only shown when true
//   links  optional affiliate keys from AFFILIATES below
//   tips   optional [{ text, when? }] callouts under the description;
//          "when" works like the step-level one (e.g. c => c.american)
//
// Each country also has a tagline, shown on the homepage Settler picker.
//
// ctx = { eu, british, american, family, passive } — derived from the quiz answers.
//
// Facts taken from knowledge.json — keep in sync when policy changes: pt-aima,
// pt-nhr, pt-residency-file, ae-tax, ae-days, ae-renew, and the US wording in homeExit.
(() => {
  const CALENDLY = "https://calendly.com/kurran-bordersx/bordersx-free-strategy-call";

  // TODO: replace these placeholder URLs with tracked affiliate links.
  const AFFILIATES = {
    wise: { label: "Open a Wise account", url: "https://wi.se/bordersx" },
    revolut: { label: "Open a Revolut account", url: "https://www.revolut.com/" },
    sim: { label: "Get an eSIM for arrival", url: "https://www.airalo.com/" },
    spotahome: { label: "Browse rentals on Spotahome", url: "https://www.spotahome.com/" },
    taxAdvisor: { label: "Get matched with a tax adviser", url: CALENDLY },
    activobank: { label: "Open an ActivoBank account", url: "https://www.activobank.pt" },
  };

  const PHASES = [
    { key: "before", name: "Before You Leave", test: (d) => d < 0 },
    { key: "d30", name: "First 30 Days", test: (d) => d <= 30 },
    { key: "d90", name: "First 90 Days", test: (d) => d <= 90 },
    { key: "year", name: "First Year", test: () => true },
  ];

  // Shared step: closing out tax residency in the home country.
  const homeExit = (prefix) => ({
    id: `${prefix}-home-exit`,
    days: -21,
    title: (c) =>
      c.british ? "Tell HMRC you're leaving (form P85)"
      : c.american ? "Set up your US filings from abroad"
      : "Deregister in your home country",
    body: (c) =>
      c.british
        ? "File a P85 and keep evidence for the Statutory Residence Test — days in the UK, your available home, and family and work ties. Check your National Insurance record too: voluntary contributions can protect your State Pension."
      : c.american
        ? "The US taxes citizens on worldwide income wherever they live. Decide between the Foreign Earned Income Exclusion (Form 2555) and foreign tax credits — the FEIE doesn't cover investment income — set up FBAR reporting for your new foreign accounts, and cut ties with your last state so it can't keep treating you as resident."
      : "Notify your tax authority and deregister your address if your country requires it — in many countries this is what formally ends your home tax residency.",
    links: ["taxAdvisor"],
  });

  const schoolPlaces = (prefix, extra) => ({
    id: `${prefix}-school`,
    days: -90,
    when: (c) => c.family,
    title: "Secure school places",
    body: `International schools often have waiting lists — apply now and ask which documents (reports, vaccination records, translated birth certificates) they need. ${extra}`,
  });

  const arrivalSim = (prefix, carriers) => ({
    id: `${prefix}-sim`,
    days: -3,
    title: "Sort your phone for arrival day",
    body: `An eSIM gets you data the moment you land — you'll need a working number for bank and government SMS codes. Switch to a local contract (${carriers}) once you have your documents.`,
    links: ["sim"],
  });

  const COUNTRIES = {
    portugal: {
      name: "Portugal",
      tagline: "D7 / D8 visas · NHR2 tax regime",
      keywords: ["portugal", "portuguese", "lisbon", "porto", "madeira", "algarve", "azores"],
      steps: [
        {
          id: "pt-visa",
          days: -120,
          when: (c) => !c.eu,
          title: (c) => (c.passive ? "Apply for your D7 (passive income) visa" : "Apply for your D8 (digital nomad) visa"),
          body: (c) =>
            `Apply at the Portuguese consulate or its visa centre in your country. You'll need proof of ${c.passive ? "regular passive income (pension, rental or investment)" : "remote income from outside Portugal"}, a NIF, a Portuguese bank account, accommodation, health insurance and a criminal record certificate.`,
        },
        {
          id: "pt-eu-docs",
          days: -60,
          when: (c) => c.eu,
          title: "Gather your EU registration documents",
          body: "As an EU citizen you don't need a visa, but you'll register your residence after arrival. Have your ID or passport, proof of income or employment, and proof of address ready.",
        },
        {
          id: "pt-nif",
          days: -90,
          title: "Get your NIF (tax number)",
          body: "You need a NIF before you can open a bank account, sign a lease or set up utilities. You can get one before arrival through a fiscal representative or an online NIF service.",
        },
        {
          id: "pt-bank",
          days: -75,
          title: "Open your bank accounts",
          body: (c) =>
            `Use a multi-currency account to move money at close to the mid-market rate, and open a Portuguese account once you have your NIF${c.eu ? "." : " — the visa application requires one."} For the Portuguese account we recommend ActivoBank: digital-first, low fees, and straightforward to open as a new resident.`,
          links: ["activobank", "wise", "revolut"],
          tips: [
            {
              when: (c) => c.american,
              text: "ActivoBank is FATCA-compliant — one of the few Portuguese banks that will open accounts for US citizens without issue.",
            },
            {
              when: (c) => c.british,
              text: "Top tip: Millennium BCP has a London branch (City of London) that can open a Portuguese account before you leave the UK. This saves significant time on arrival — book an appointment before your move date.",
            },
          ],
        },
        {
          id: "pt-tax",
          days: -60,
          title: "Book cross-border tax advice",
          body: "Confirm whether your income qualifies for NHR2 (IFICI) and plan the timing of your exit from your home tax system before you become Portuguese tax resident.",
          links: ["taxAdvisor"],
        },
        {
          id: "pt-aima",
          days: -60,
          when: (c) => !c.eu,
          title: "Start the AIMA appointment process now",
          body: "AIMA appointments are backlogged 8–12 weeks. Start booking before you travel or the day you arrive — waiting until month 2–3 causes serious delays.",
        },
        {
          id: "pt-home",
          days: -45,
          title: "Secure your accommodation",
          body: (c) =>
            `${c.eu ? "" : "Visa applications usually need a 12-month lease. "}A mid-term rental gives you time to view areas in person before committing to a long lease.`,
          links: ["spotahome"],
        },
        homeExit("pt"),
        {
          id: "pt-health-cover",
          days: -30,
          title: "Arrange health cover",
          body: (c) =>
            c.eu
              ? "Bring your EHIC to bridge the gap until you're registered with the national health service (SNS)."
              : "Private health insurance is required for your visa and covers you until you're registered with the SNS.",
        },
        {
          id: "pt-docs",
          days: -21,
          title: "Apostille and translate key documents",
          body: (c) =>
            `Birth${c.family ? ", marriage and your children's birth" : ""} certificates and your criminal record certificate usually need an apostille, and sometimes a certified Portuguese translation.`,
        },
        schoolPlaces("pt", "Public schools enrol through your local school cluster (agrupamento)."),
        arrivalSim("pt", "MEO, Vodafone or NOS"),
        {
          id: "pt-address",
          days: 14,
          title: "Update your NIF address to Portugal",
          body: "Change your tax address on the Portal das Finanças once you have a Portuguese address — this marks you as resident and ends the need for a fiscal representative.",
        },
        {
          id: "pt-utilities",
          days: 20,
          title: "Put utilities and internet in your name",
          body: "Electricity, water and internet providers will ask for your NIF and lease.",
        },
        {
          id: "pt-crue",
          days: 30,
          when: (c) => c.eu,
          title: "Register as an EU resident (CRUE)",
          body: "If you're staying more than 3 months, get your EU registration certificate from your local Câmara Municipal.",
        },
        {
          id: "pt-aima-attend",
          days: 30,
          when: (c) => !c.eu,
          title: "Attend AIMA and get your residence permit",
          body: "Bring your passport with visa, NIF, lease, proof of income and insurance. Your residence card follows by post — keep the appointment receipt as proof of status.",
        },
        {
          id: "pt-niss",
          days: 30,
          title: "Get your social security number (NISS)",
          body: "Needed to work or register as self-employed, and helpful when registering for healthcare.",
        },
        {
          id: "pt-sns",
          days: 30,
          title: "Register at your local health centre",
          body: "Get your SNS user number (número de utente) at the Centro de Saúde for your address.",
        },
        {
          id: "pt-licence",
          days: 90,
          title: "Check your driving licence",
          body: (c) =>
            c.eu
              ? "EU licences remain valid in Portugal — just update your address details if required."
              : "Check with IMT whether your licence needs to be exchanged now that you're resident, and the deadline that applies to you.",
        },
        {
          id: "pt-nhr",
          days: 180,
          title: "Apply for NHR2 (IFICI) — within your first year",
          body: "NHR2 must be applied for within your first year of residency. Miss the window and it's lost for good — it can't be applied for retrospectively.",
          links: ["taxAdvisor"],
        },
        {
          id: "pt-residency-file",
          days: 330,
          title: "Start your residency file",
          body: (c) =>
            `Keep leases, permits and tax returns in one place. Naturalisation now requires 10 years of legal residence${c.eu ? "" : ", and gaps in your permit renewals can reset the clock"}.`,
        },
        {
          id: "pt-irs",
          days: 365,
          title: "File your first Portuguese tax return (IRS)",
          body: "Returns are filed between April and June for the previous calendar year.",
          links: ["taxAdvisor"],
        },
      ],
    },

    uae: {
      name: "the UAE",
      tagline: "Golden Visa · no personal income tax",
      keywords: ["uae", "dubai", "abu dhabi", "emirates", "emirati", "sharjah", "ras al khaimah"],
      steps: [
        {
          id: "ae-route",
          days: -120,
          title: "Choose your residence route",
          body: (c) =>
            c.passive
              ? "Without a UAE employer, the usual routes are a Golden Visa through property (AED 2m+) or investment, or a self-sponsored visa. Pick one before you commit to a property or a free zone."
              : "Your options are an employer-sponsored visa, a free-zone company or freelance permit, the remote work visa, or a Golden Visa. Your choice decides who sponsors your residence.",
        },
        schoolPlaces("ae", "Check schools' KHDA (Dubai) or ADEK (Abu Dhabi) inspection ratings."),
        {
          id: "ae-tax",
          days: -90,
          title: "Book cross-border tax advice",
          body: (c) =>
            `There's no personal income tax in the UAE, but leaving your home system cleanly is the hard part.${c.british ? " HMRC also uses the 90-day figure when assessing UK non-residency." : ""}${c.american ? " As a US citizen you remain taxable on worldwide income." : ""}`,
          links: ["taxAdvisor"],
        },
        {
          id: "ae-attest",
          days: -60,
          title: "Attest your documents",
          body: (c) =>
            `Degree${c.family ? ", marriage and birth" : ""} certificates need legalising in your home country, then by the UAE embassy, then by the UAE Ministry of Foreign Affairs.${c.family ? " You can't sponsor your family's visas without them." : ""}`,
        },
        {
          id: "ae-home",
          days: -45,
          title: "Plan your housing",
          body: "Book a short-let for your first weeks, then sign a long-term lease. In Dubai the lease must be registered with Ejari — you'll need that for utilities and family sponsorship.",
        },
        homeExit("ae"),
        {
          id: "ae-transfer",
          days: -30,
          title: "Set up a way to move money",
          body: "A UAE bank account needs an Emirates ID, which takes a few weeks. Use a multi-currency account to cover deposits and rent until then.",
          links: ["wise", "revolut"],
        },
        arrivalSim("ae", "du or e&"),
        {
          id: "ae-insurance",
          days: 7,
          title: "Get UAE health insurance",
          body: "Health insurance is required before your residence visa can be issued.",
        },
        {
          id: "ae-medical",
          days: 10,
          title: "Medical test and Emirates ID biometrics",
          body: "Complete the medical fitness test and Emirates ID biometrics as soon as your entry permit is processed.",
        },
        {
          id: "ae-ejari",
          days: 21,
          title: "Sign your lease and connect utilities",
          body: "Register your tenancy (Ejari in Dubai) and set up electricity and water (DEWA in Dubai).",
        },
        {
          id: "ae-eid",
          days: 30,
          title: "Collect your Emirates ID and residence visa",
          body: "Almost everything else — banking, phone contract, driving licence — depends on it.",
        },
        {
          id: "ae-days",
          days: 30,
          title: "Start a day-count log",
          body: "UAE residency requires at least 90 days a year in the country. Missing it risks losing UAE residency and your home-country non-resident position at the same time.",
        },
        {
          id: "ae-bank",
          days: 45,
          title: "Open a UAE bank account",
          body: "Apply with your Emirates ID, tenancy contract and proof of income at a bank such as Emirates NBD, Mashreq or ADCB.",
          links: ["wise"],
        },
        {
          id: "ae-licence",
          days: 60,
          title: "Convert your driving licence",
          body: "Licences from many countries, including the UK, US and EU, can be converted without a test — check the current RTA list.",
        },
        {
          id: "ae-family",
          days: 60,
          when: (c) => c.family,
          title: "Sponsor your family's residence visas",
          body: "With your own visa issued, apply for your dependants using your attested marriage and birth certificates and your tenancy contract.",
        },
        {
          id: "ae-will",
          days: 180,
          title: "Register a will",
          body: "Without a registered will (for example through the DIFC Wills Service), UAE assets can fall under default succession rules rather than your wishes.",
        },
        {
          id: "ae-trc",
          days: 300,
          title: "Apply for a Tax Residency Certificate",
          body: "Once you meet the days test, request a certificate from the Federal Tax Authority — it's your proof of residency for your home tax authority.",
          links: ["taxAdvisor"],
        },
        {
          id: "ae-renew",
          days: 330,
          title: "Check your days and visa renewal",
          body: "Confirm you've met the 90-day minimum and diary your visa renewal. Standard residence visas can lapse if you spend more than 6 months in a row abroad (Golden Visas are exempt).",
        },
      ],
    },

    malta: {
      name: "Malta",
      tagline: "Nomad permit · Global Residence Programme",
      keywords: ["malta", "maltese", "valletta"],
      steps: [
        {
          id: "mt-route",
          days: -120,
          title: (c) => (c.eu ? "Confirm your EU residence plan" : "Choose your residence permit"),
          body: (c) =>
            c.eu
              ? "As an EU citizen you don't need a visa — you'll apply for your residence document with Identità after arrival. Have proof of income or employment ready."
              : c.passive
                ? "The Global Residence Programme suits passive income: a flat 15% on foreign income remitted to Malta (a minimum tax applies), with a qualifying property rental or purchase. Check the current thresholds before you commit."
                : "The Nomad Residence Permit suits remote workers employed or contracted outside Malta. Check the current minimum income threshold and apply through Identità.",
        },
        schoolPlaces("mt", "Teaching is in English, which makes Malta easier than most EU moves for children."),
        {
          id: "mt-tax",
          days: -90,
          title: "Book cross-border tax advice",
          body: "Residents who aren't Malta-domiciled are generally taxed on foreign income only when it's brought into Malta. Getting your account structure right before you move matters more than anything you do after.",
          links: ["taxAdvisor"],
        },
        {
          id: "mt-docs",
          days: -45,
          title: "Prepare your application documents",
          body: (c) =>
            `Passport, police certificate, proof of income, health insurance and apostilled certificates${c.family ? " for every family member" : ""}.`,
        },
        {
          id: "mt-home",
          days: -45,
          title: "Secure your accommodation",
          body: "Long lets must be registered with the Housing Authority by your landlord — ask for proof, as you'll need it for your residence application.",
        },
        homeExit("mt"),
        {
          id: "mt-transfer",
          days: -30,
          title: "Set up a way to move money",
          body: "Opening a Maltese bank account can take weeks because of strict checks, so have a multi-currency account ready to cover the gap.",
          links: ["wise", "revolut"],
        },
        {
          id: "mt-health",
          days: -30,
          title: "Arrange health cover",
          body: (c) =>
            c.eu
              ? "Bring your EHIC to cover you until your local entitlement is set up."
              : "Private health insurance is required for your permit application.",
        },
        arrivalSim("mt", "Epic, GO or Melita"),
        {
          id: "mt-utilities",
          days: 21,
          title: "Put utilities in your name",
          body: "Water and electricity are billed through ARMS — register your account with your lease.",
        },
        {
          id: "mt-tin",
          days: 21,
          title: "Get your tax and social security numbers",
          body: "Register with the Commissioner for Revenue for a tax number, and get a social security number if you'll be working.",
        },
        {
          id: "mt-identita",
          days: 30,
          title: "Apply for your residence card with Identità",
          body: (c) =>
            c.eu
              ? "EU citizens staying longer than 3 months need a residence document — book early, as appointments fill up."
              : "Submit your permit application and biometrics. Your residence card is what you'll use for banking and other registrations.",
        },
        {
          id: "mt-bank",
          days: 30,
          title: "Apply for a Maltese bank account",
          body: "Banks such as Bank of Valletta, HSBC Malta or APS expect proof of address and source of funds. Expect it to take a few weeks.",
          links: ["wise"],
        },
        {
          id: "mt-family",
          days: 45,
          when: (c) => c.family,
          title: "Register your dependants",
          body: "Add family members to your residence application or file their own applications with Identità.",
        },
        {
          id: "mt-healthcare",
          days: 60,
          title: "Confirm your healthcare access",
          body: "Register with a local GP or health centre, and check whether you're entitled to public healthcare or rely on private cover.",
        },
        {
          id: "mt-licence",
          days: 60,
          title: "Check your driving licence",
          body: (c) =>
            c.eu
              ? "EU licences remain valid. Remember Malta drives on the left."
              : "Check with Transport Malta whether your licence needs converting now that you're resident. Malta drives on the left.",
        },
        {
          id: "mt-days",
          days: 60,
          title: "Start a day-count log",
          body: "Your permit and tax status depend on where you spend your time. For example, the Global Residence Programme requires that you don't spend more than 183 days in any other single country.",
        },
        {
          id: "mt-return",
          days: 300,
          title: "Prepare your first Maltese tax return",
          body: "Individual returns are usually due by 30 June of the following year — report any foreign income you brought into Malta.",
          links: ["taxAdvisor"],
        },
        {
          id: "mt-renew",
          days: 330,
          title: "Diary your permit renewal",
          body: "Most permits are renewed annually — gather your updated income proof, lease and insurance in advance.",
        },
      ],
    },

    georgia: {
      name: "Georgia",
      tagline: "Visa-free year · 1% small business tax",
      keywords: ["georgia", "georgian", "tbilisi", "batumi"],
      steps: [
        {
          id: "ge-tax",
          days: -90,
          title: "Book cross-border tax advice",
          body: (c) =>
            `Georgia generally doesn't tax individuals on foreign-source income${c.passive ? "" : ", and an Individual Entrepreneur with Small Business status pays 1% on turnover up to GEL 500,000"}. Check how your home country treats the move${c.american ? " — as a US citizen you stay taxable on worldwide income" : ""}.`,
          links: ["taxAdvisor"],
        },
        schoolPlaces("ge", "Tbilisi has several international schools — places are limited."),
        {
          id: "ge-entry",
          days: -60,
          title: "Confirm your entry rules",
          body: "Citizens of many countries, including the UK, US and EU, can stay visa-free for up to a year — check that your nationality is on the current list.",
        },
        {
          id: "ge-docs",
          days: -30,
          title: "Bring apostilled documents",
          body: (c) =>
            `Bring apostilled birth${c.family ? " and marriage" : ""} certificates and any qualifications. Get Georgian translations done by a notary locally, which is quick and inexpensive.`,
        },
        {
          id: "ge-home",
          days: -30,
          title: "Book your first month's housing",
          body: "Start with a short-term rental in Tbilisi or Batumi and choose a neighbourhood in person before signing a long lease.",
        },
        homeExit("ge"),
        {
          id: "ge-transfer",
          days: -21,
          title: "Set up a way to move money",
          body: "Use a multi-currency account to move funds in at a good rate, then hold GEL and USD locally.",
          links: ["wise", "revolut"],
        },
        {
          id: "ge-insurance",
          days: -21,
          title: "Arrange international health cover",
          body: "Private healthcare in Georgia is good value, but you'll want insurance that covers serious treatment or evacuation.",
        },
        arrivalSim("ge", "Magti, Silknet or Cellfie"),
        {
          id: "ge-bank",
          days: 7,
          title: "Open a Georgian bank account",
          body: "TBC Bank and Bank of Georgia can often open an account the same day with just your passport.",
          links: ["wise"],
        },
        {
          id: "ge-utilities",
          days: 14,
          title: "Set up internet and utilities",
          body: "Many landlords handle utilities. Arrange fibre internet with Magti or Silknet if it isn't included.",
        },
        {
          id: "ge-ie",
          days: 21,
          when: (c) => !c.passive,
          title: "Register as an Individual Entrepreneur",
          body: "Register at the Public Service Hall, then apply to the Revenue Service for Small Business status to get the 1% turnover rate.",
        },
        {
          id: "ge-rs",
          days: 30,
          when: (c) => !c.passive,
          title: "Set up your Revenue Service account",
          body: "File your monthly turnover declarations online at rs.ge — set a recurring reminder.",
        },
        {
          id: "ge-days",
          days: 30,
          title: "Start a day-count log",
          body: "You become Georgian tax resident after 183 days in any 12-month period — keep a record from day one.",
        },
        {
          id: "ge-residence",
          days: 60,
          title: "Decide on a residence permit",
          body: "You don't need one during your visa-free year, but a permit (for example through work, business or property — check the current minimum value) makes banking and longer stays easier.",
        },
        {
          id: "ge-licence",
          days: 75,
          title: "Check your driving licence",
          body: "Confirm whether your licence is valid for residents or should be exchanged at the Public Service Hall.",
        },
        {
          id: "ge-trc",
          days: 200,
          title: "Get a tax residency certificate",
          body: "Once you pass 183 days, request a certificate from the Revenue Service — it's your proof of residency for your home tax authority.",
          links: ["taxAdvisor"],
        },
        {
          id: "ge-visa-clock",
          days: 330,
          title: "Plan around your 365-day limit",
          body: "Your visa-free stay runs for a year from entry — leave and re-enter, or have a residence permit in place, before it ends.",
        },
      ],
    },
  };

  window.BX_SETTLER_DATA = { AFFILIATES, PHASES, COUNTRIES };
})();
