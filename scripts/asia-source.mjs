// Singapore and Hong Kong master's programmes — merged into europe.json by
// build-europe.mjs. Same editing rules as scripts/europe-source.mjs:
//
//  1. Every value came off a page someone actually read. `null` means "not
//     stated on any page I read", and the UI prints "Unknown / Verify".
//  2. `source` is the page the value was read from. check-europe-links.mjs
//     fetches every URL here.
//  3. University-level facts inherit down to the programmes.
//
// One thing works differently here than in Europe, and it matters. European
// tuition is mostly national law, so a country card can answer for forty
// programmes at once. In Singapore and Hong Kong taught master's are
// SELF-FINANCING and priced programme by programme — HK$168,960 and HK$375,000
// are both real Hong Kong master's fees. So these two cards carry
// `basis: 'per-programme'`, which makes the UI say "regional pattern" instead
// of "national rule" when a row falls back to them.

const v = (value, source, note) => ({
  value: value ?? null,
  ...(note ? { note } : {}),
  ...(source ? { source } : {}),
})

const CHECKED = '2026-09-03'

// ── shared sources ───────────────────────────────────────────────────────────
const HKPFS = 'https://cerg1.ugc.edu.hk/hkpfs/index.html'
const HKUST_RPG_FEE = 'https://registry.hkust.edu.hk/resource-library/tuition-rates-research-pg'
const HKUST_TPG_FEE = 'https://registry.hkust.edu.hk/resource-library/tuition-rates-taught-pg'
const HKUST_MONEY =
  'https://fytgs.hkust.edu.hk/admissions/Admission-to-Hong-Kong-Campus/submitting-an-application/scholarships-and-fees'
const CUHK_REQ = 'https://www.gs.cuhk.edu.hk/admissions/requirements'
const CUHK_SCI = 'https://www.gs.cuhk.edu.hk/programmes/science'
const HKU_ENGG_FEE = 'https://engg.hku.hk/Admissions/MSc/Fees'
const HKU_ENGG_LIST = 'https://engg.hku.hk/Admissions/MSc/Curricula-Offered'
const HKU_ENGLISH = 'https://portal.hku.hk/tpg-admissions/applying/admission-requirements'
const HKU_SCI_LIST = 'https://www.scifac.hku.hk/prospective/tpg/about'
const HKU_PHYS = 'https://www.scifac.hku.hk/prospective/tpg/Physics'
const HKU_CS_REQ = 'https://master.cds.hku.hk/msccs/admission/application-details/'
const NUS_SCI_FAQ =
  'https://www.science.nus.edu.sg/graduates/msc-coursework-programmes/faq-coursework-programmes/'
const NUS_SCI_LIST = 'https://www.science.nus.edu.sg/graduates/msc-coursework-programmes/'
const NUS_CDE_LIST = 'https://cde.nus.edu.sg/graduate/graduate-programmes-by-coursework/'
const NUS_SOC_LIST = 'https://www.comp.nus.edu.sg/programmes/'
const NUS_DSML_FEE = 'https://www.math.nus.edu.sg/wp-content/uploads/sites/4/2025/04/MDSML-AY2026-International-Students.pdf'
const NTU_FEES = 'https://www.ntu.edu.sg/admissions/graduate/financialmatters/pgtuitionfees'
const NTU_BOND = 'https://www.ntu.edu.sg/admissions/graduate/financialmatters/service-obligation'
const NTU_CCDS =
  'https://www.ntu.edu.sg/computing/admissions/graduate-programmes/master-of-science-programmes'
const NTU_EEE = 'https://www.ntu.edu.sg/eee/admissions/programmes/graduate-programmes/msc'
const NTU_MAE = 'https://www.ntu.edu.sg/mae/admissions/graduate-programmes'
const NTU_CEE = 'https://www.ntu.edu.sg/cee/admissions/graduate'
const NTU_SPMS_MSC =
  'https://www.ntu.edu.sg/spms/admissions/grad/detail/spms-master-of-science-in-mathematical-sciences'

const CUHK_MATH = 'https://www.gs.cuhk.edu.hk/programmes/science/msc-mathematics'
const CUHK_PHYS = 'https://www.gs.cuhk.edu.hk/programmes/science/msc-physics'
const CUHK_EEAS =
  'https://www.gs.cuhk.edu.hk/programmes/science/msc-earth-and-environmental-analytics-sustainability'
const CUHK_CS = 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-computer-science'
// Each MPhil-PhD page states the same rate; this is the one it was read from.
const CUHK_RPG_FEE = 'https://www.gs.cuhk.edu.hk/programmes/science/mphil-phd-physics'

/** The HKUST research-postgraduate rate, identical on every MPhil row. */
const RPG = {
  tuition: {
    non_eu: v('HK$47,000 / year', HKUST_RPG_FEE, '2026–27 research postgraduate rate'),
    eu: v('HK$47,000 / year', HKUST_RPG_FEE, '2026–27 research postgraduate rate'),
  },
  scholarship: {
    level: 'full',
    value: 'Postgraduate Studentship HK$229,620 a year',
    source: HKUST_MONEY,
  },
}

/** CUHK research postgraduates pay a flat rate, an order of magnitude under the taught fee. */
const CUHK_RPG_TUITION = {
  non_eu: v('HK$49,500 / year', CUHK_RPG_FEE, '2027/28 research postgraduate rate'),
  eu: v('HK$49,500 / year', CUHK_RPG_FEE, '2027/28 research postgraduate rate'),
}

/** HKPFS is territory-wide, so every CUHK research row carries the same award. */
const HKPFS_AWARD = {
  level: 'full',
  value: 'HKPFS: HK$344,400 a year plus HK$14,400 travel, 400 awards for 2027/28',
  source: HKPFS,
}

/** HKU Engineering prices every MSc(Eng) identically. */
const HKU_ENGG_TUITION = {
  non_eu: v('HK$375,000 whole programme', HKU_ENGG_FEE, '2026–27 intake'),
  eu: v('HK$250,000 whole programme', HKU_ENGG_FEE, 'local rate'),
}

export const ASIA_COUNTRIES = [
  {
    country: 'Singapore',
    code: 'SG',
    labels: { local: 'Subsidised', international: 'International' },
    basis: 'per-programme',
    tuition: {
      eu: v(
        'Rebates only, no separate rate',
        NTU_CCDS,
        'S$5,000 NTU subsidy for Citizens/PRs on self-financed master' + String.fromCharCode(39) + 's (up to S$15,000 with need); NUS rebates Citizens, PRs and its own alumni',
      ),
      non_eu: v(
        'S$58,860–63,220',
        NTU_FEES,
        'incl. 9% GST. Set per programme, not nationally — this is the range across the programmes read here',
      ),
    },
    scholarships: v(
      'Coursework master\'s are essentially unfunded — NUS states there are "in general no scholarships available for graduate coursework programmes"',
      NUS_SCI_FAQ,
    ),
    note:
      'The assumption to drop here is the MOE Tuition Grant. NTU now states plainly that the ' +
      'service obligation "is no longer available to international students applying for Coursework ' +
      'Programmes" — the subsidised rate with its 3-year Singapore work bond survives only for ' +
      'RESEARCH degrees. So an international taught MSc is full price with no scholarship attached, ' +
      'while a PhD is funded. In Singapore the funded route and the taught route are different doors.',
  },
  {
    country: 'Hong Kong SAR',
    code: 'HK',
    labels: { local: 'Local', international: 'Non-local' },
    basis: 'per-programme',
    tuition: {
      eu: v(
        'HK$240,000–250,000',
        HKU_ENGG_FEE,
        'only where a programme prices locals separately (HKU Engineering and Computer Science); many charge one rate to everyone',
      ),
      non_eu: v(
        'HK$168,960–375,000',
        HKUST_TPG_FEE,
        'taught master' + String.fromCharCode(39) + 's are self-financing and priced per programme — this is the range across those read here; research MPhil/PhD is a separate HK$47,000–49,500 a year',
      ),
    },
    scholarships: v(
      'Hong Kong PhD Fellowship Scheme: HK$344,400 a year plus HK$14,400 travel, 400 awards for 2027/28 — doctoral only',
      HKPFS,
    ),
    note:
      'Hong Kong splits sharply by degree type. A taught MSc is a full-price product with almost no ' +
      'aid attached. A research MPhil or PhD costs HK$47,000–49,500 a year and comes with a studentship — ' +
      'HKUST pays HK$229,620 a year, and the territory-wide HKPFS pays HK$344,400 plus travel to ' +
      '400 people. If the money matters more than the extra year, apply research-side.',
  },
]

export const ASIA_UNIVERSITIES = [
  // ── Singapore ──────────────────────────────────────────────────────────────
  {
    name: 'National University of Singapore',
    city: 'Singapore',
    country: 'Singapore',
    checked_at: CHECKED,
    language: v('English', NUS_SCI_FAQ, 'all listed programmes are taught in English'),
    scholarship: {
      level: 'none',
      value:
        'NUS states there are in general no scholarships for graduate coursework programmes — only fee rebates for Citizens, PRs and NUS alumni',
      source: NUS_SCI_FAQ,
    },
    english: v(
      'TOEFL iBT 85 — or 4.5 for tests from 21 Jan 2026 · IELTS 6.0',
      NUS_SCI_FAQ,
      'Faculty of Science minimum; other faculties set their own',
    ),
    deadline: v(null),
    phd: {
      value: 'yes',
      note: 'PhD admission is separate from the coursework MSc, and is the funded route.',
      source: 'https://www.comp.nus.edu.sg/programmes/pg/phdcs/',
    },
    programs: [
      {
        name: 'MSc in Mathematics',
        fields: ['Mathematics', 'Applied Mathematics'],
        link: 'https://www.math.nus.edu.sg/pg/msc-cwk/',
        duration: v('1 year full-time (Track 1, 40 units)', 'https://www.math.nus.edu.sg/pg/msc-cwk/'),
        admissions: NUS_SCI_LIST,
      },
      {
        name: 'MSc in Data Science and Machine Learning',
        fields: ['Computational Science', 'Computer Science', 'Applied Mathematics'],
        link: 'https://www.math.nus.edu.sg/ms-dsml-v1/',
        tuition: {
          non_eu: v('S$58,860 total', NUS_DSML_FEE, 'AY2026, incl. 9% GST; S$47,088 for NUS alumni'),
        },
      },
      { name: 'MSc in Quantitative Finance', fields: ['Applied Mathematics'], link: 'https://www.math.nus.edu.sg/pg/mqf/' },
      { name: 'MSc in Statistics', fields: ['Mathematics', 'Computational Science'], link: 'https://www.stat.nus.edu.sg/education/graduate/msc-in-statistics/prospective-students/' },
      { name: 'MSc in Data Science for Sustainability', fields: ['Computational Science', 'Atmosphere & Ocean'], link: 'https://www.stat.nus.edu.sg/education/graduate/msc-in-data-science-for-sustainability/prospective-students/' },
      { name: 'MSc in Physics', fields: ['Physics'], link: 'https://www.physics.nus.edu.sg/student/master-of-science-by-coursework/' },
      { name: 'MSc in Physics for Technology', fields: ['Applied Physics', 'Physics'], link: 'https://www.physics.nus.edu.sg/student/master-in-physics-technology/' },
      { name: 'MSc in AI for Science', fields: ['Computational Science', 'Computer Science', 'Physics'], link: 'https://www.physics.nus.edu.sg/student/msc-ai-for-science/' },
      { name: 'Master of Computing (Computer Science)', fields: ['Computer Science'], link: 'https://www.comp.nus.edu.sg/programmes/pg/mcs/', admissions: NUS_SOC_LIST },
      { name: 'Master of Computing (Artificial Intelligence)', fields: ['Computer Science'], link: 'https://www.comp.nus.edu.sg/programmes/pg/mai/', admissions: NUS_SOC_LIST },
      { name: 'Master of Computing (Infocomm Security)', fields: ['Computer Science'], link: 'https://www.comp.nus.edu.sg/programmes/pg/misc/', admissions: NUS_SOC_LIST },
      { name: 'Master of Computing (General Track)', fields: ['Computer Science'], link: 'https://www.comp.nus.edu.sg/programmes/pg/mcomp-gen/', admissions: NUS_SOC_LIST },
      { name: 'MSc in Civil Engineering', fields: ['Engineering'], link: 'https://cde.nus.edu.sg/cee/graduate/coursework-based-programmes/msc-ce/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Environmental Engineering', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://cde.nus.edu.sg/cee/graduate/coursework-based-programmes/msc-eve/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Computer Engineering', fields: ['Engineering', 'Computer Science'], link: 'https://cde.nus.edu.sg/ece/graduate/msc-computer-engineering/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Electrical Engineering', fields: ['Engineering'], link: 'https://cde.nus.edu.sg/ece/graduate/msc-electrical-engineering/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Mechanical Engineering', fields: ['Engineering'], link: 'https://cde.nus.edu.sg/me/graduate/msc-me/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Robotics', fields: ['Engineering', 'Computer Science'], link: 'https://cde.nus.edu.sg/me/graduate/msc-robotics/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Materials Science and Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://cde.nus.edu.sg/mse/graduates/master-of-science-msc/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Industrial & Systems Engineering', fields: ['Engineering', 'Applied Mathematics'], link: 'https://cde.nus.edu.sg/isem/graduate/coursework/masters-of-science-industrial-and-systems-engineering-programme/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Maritime Technology and Management', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://cde.nus.edu.sg/isem/graduate/coursework/masters-of-science-maritime-technology-management-programme/', admissions: NUS_CDE_LIST },
      { name: 'MSc in Energy Systems', fields: ['Engineering', 'Applied Physics'], link: 'https://cde.nus.edu.sg/chbe/graduate/research-and-course-work-based-programmes/admissions/msc-energy-systems-programme/', admissions: NUS_CDE_LIST },
    ],
  },

  {
    name: 'Nanyang Technological University',
    city: 'Singapore',
    country: 'Singapore',
    checked_at: CHECKED,
    language: v('English', NTU_CCDS, 'all listed programmes are taught in English'),
    tuitionLink: NTU_FEES,
    // 'none' rather than 'partial': the S$5,000 subsidy is for Singapore
    // Citizens and PRs only, so a chip reading "partial" would tell an
    // international reader of this page the opposite of the truth.
    scholarship: {
      level: 'none',
      value:
        'Nothing listed for international coursework students — the S$5,000 subsidy (up to S$15,000 with need) and the 10% alumni rebate go to Citizens, PRs and NTU alumni',
      source: NTU_CCDS,
    },
    english: v(null),
    deadline: v(null),
    phd: {
      value: 'yes',
      note:
        'MOE subsidy with the 3-year Singapore work bond is still open to international RESEARCH students — it has closed to coursework students.',
      source: NTU_BOND,
    },
    programs: [
      { name: 'MSc in Communications Engineering', fields: ['Engineering'], link: 'https://www.ntu.edu.sg/eee/admissions/programmes/graduate-programmes/detail/master-of-science-in-communications-engineering', deadline: v('August 2027 intake: 1 Oct 2026 – 31 Mar 2027', NTU_EEE, 'EEE dates; the January intake runs 1 Jul – 31 Aug 2026') },
      { name: 'MSc in Computer Control & Automation', fields: ['Engineering', 'Computer Science'], link: 'https://www.ntu.edu.sg/eee/admissions/programmes/graduate-programmes/detail/master-of-science-in-computer-control-automation', deadline: v('August 2027 intake: 1 Oct 2026 – 31 Mar 2027', NTU_EEE, 'EEE dates') },
      { name: 'MSc in Integrated Circuits and Microelectronics', fields: ['Engineering', 'Applied Physics'], link: 'https://www.ntu.edu.sg/eee/admissions/programmes/graduate-programmes/detail/master-of-science-in-integrated-circuits-and-microelectronics', deadline: v('August 2027 intake: 1 Oct 2026 – 31 Mar 2027', NTU_EEE, 'EEE dates') },
      { name: 'MSc in Power Engineering', fields: ['Engineering'], link: 'https://www.ntu.edu.sg/eee/admissions/programmes/graduate-programmes/detail/master-of-science-in-power-engineering', deadline: v('August 2027 intake: 1 Oct 2026 – 31 Mar 2027', NTU_EEE, 'EEE dates') },
      { name: 'MSc in Signal Processing and Machine Learning', fields: ['Engineering', 'Applied Mathematics', 'Computer Science'], link: 'https://www.ntu.edu.sg/eee/admissions/programmes/graduate-programmes/detail/master-of-science-in-signal-processing', deadline: v('August 2027 intake: 1 Oct 2026 – 31 Mar 2027', NTU_EEE, 'EEE dates') },
      { name: 'MSc in Mechanical Engineering', fields: ['Engineering'], link: 'https://www.ntu.edu.sg/education/graduate-programme/master-of-science-in-mechanical-engineering-2', admissions: NTU_MAE },
      { name: 'MSc in Green Energy Technologies', fields: ['Engineering', 'Applied Physics'], link: 'https://www.ntu.edu.sg/education/graduate-programme/master-of-science-in-green-energy-technologies', admissions: NTU_MAE },
      { name: 'MSc in Smart Manufacturing', fields: ['Engineering'], link: 'https://www.ntu.edu.sg/education/graduate-programme/master-of-science-in-smart-manufacturing', admissions: NTU_MAE },
      { name: 'MSc in Civil Engineering', fields: ['Engineering'], link: 'https://www.ntu.edu.sg/cee/admissions/graduate/detail/master-of-science-in-civil-engineering', admissions: NTU_CEE },
      { name: 'MSc in Sustainability and Environmental Engineering', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://www.ntu.edu.sg/cee/admissions/graduate/detail/master-of-science-in-sustainability-and-environmental-engineering', admissions: NTU_CEE },
      { name: 'MSc in Maritime Studies', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://www.ntu.edu.sg/cee/admissions/graduate/detail/master-of-science-in-maritime-studies', admissions: NTU_CEE },
      {
        name: 'MSc in Artificial Intelligence',
        fields: ['Computer Science'],
        link: NTU_CCDS,
        duration: v('1 year full-time (30 AU)', NTU_CCDS),
        tuition: { non_eu: v('S$63,220 total', NTU_CCDS, 'incl. 9% GST; AY2025 intake onwards') },
      },
      {
        name: 'MSc in Data Science',
        fields: ['Computer Science', 'Computational Science'],
        link: 'https://www.ntu.edu.sg/education/graduate-programme/master-of-science-in-data-science-(msds)',
        tuition: { non_eu: v('S$63,220 total', NTU_CCDS, 'incl. 9% GST; AY2025 intake onwards') },
      },
      {
        name: 'MSc in Cyber Security',
        fields: ['Computer Science'],
        link: NTU_CCDS,
        tuition: { non_eu: v('S$63,220 total', NTU_CCDS, 'incl. 9% GST; AY2025 intake onwards') },
      },
      {
        name: 'MSc in Mathematical Sciences (by research)',
        fields: ['Mathematics', 'Applied Mathematics'],
        link: NTU_SPMS_MSC,
        duration: v('1–3 years', NTU_SPMS_MSC, 'research thesis plus 12 AU of coursework'),
      },
      { name: 'MSc in Environmental Sustainability Science', fields: ['Atmosphere & Ocean'], link: 'https://www.ntu.edu.sg/ase/admissions/graduate-programmes/master-by-coursework' },
      { name: 'MSc in Robotics and Intelligent Systems', fields: ['Engineering', 'Computer Science'], link: 'https://www.ntu.edu.sg/education/graduate-programme/master-of-science-(robotics-and-intelligent-systems)' },
    ],
  },

  // ── Hong Kong ──────────────────────────────────────────────────────────────
  {
    name: 'HKUST',
    city: 'Hong Kong',
    country: 'Hong Kong SAR',
    checked_at: CHECKED,
    language: v('English', HKUST_MONEY, 'all listed programmes are taught in English'),
    tuitionLink: HKUST_TPG_FEE,
    scholarship: {
      level: 'partial',
      value:
        'Asian Future Leaders Scholarship for Asian master’s students: HK$97,190 tuition waiver plus a HK$97,190 stipend on taught programmes',
      source: HKUST_MONEY,
    },
    english: v(null),
    deadline: v(null),
    phd: {
      value: 'yes',
      note:
        'Studentship HK$229,620 a year; HKPFS pays HK$344,400 a year plus a tuition waiver, and RedBird adds HK$40,000 in year one for international PhDs.',
      source: HKUST_MONEY,
    },
    programs: [
      { name: 'MSc in Physics', fields: ['Physics'], link: 'https://msphy.hkust.edu.hk/' },
      { name: 'MSc in Data-Driven Modeling', fields: ['Computational Science', 'Applied Mathematics', 'Physics'], link: 'https://msdm.hkust.edu.hk/' },
      { name: 'MSc in Financial Mathematics', fields: ['Applied Mathematics'], link: 'https://mafm.hkust.edu.hk/' },
      { name: 'MSc in Global Marine Resources Management', fields: ['Atmosphere & Ocean'], link: 'https://mscgmrm.org/' },
      { name: 'MSc in Artificial Intelligence', fields: ['Computer Science'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-ai' },
      { name: 'MSc in Big Data Technology', fields: ['Computer Science', 'Computational Science'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-bdt' },
      { name: 'MSc in Information Technology', fields: ['Computer Science'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-it' },
      { name: 'MSc in Electronic Engineering', fields: ['Engineering'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-eleg' },
      { name: 'MSc in Integrated Circuits', fields: ['Engineering', 'Applied Physics'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-ic' },
      { name: 'MSc in Mechanical Engineering', fields: ['Engineering'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-mech' },
      { name: 'MSc in Aeronautical Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-ae' },
      { name: 'MSc in Civil Infrastructural Engineering and Management', fields: ['Engineering'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-ciem' },
      { name: 'MSc in Environmental Engineering and Management', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-evem' },
      { name: 'MSc in Chemical and Energy Engineering', fields: ['Engineering'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-cee' },
      { name: 'MSc in Materials Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-mate' },
      { name: 'MSc in Digital and Sustainable Cities', fields: ['Engineering'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-disc' },
      { name: 'MSc in Telecommunications', fields: ['Engineering'], link: 'https://seng.hkust.edu.hk/academics/taught-postgraduate/msc-telecom' },

      // Research master's — the same departments at a tenth of the fee, funded.
      { name: 'MPhil in Marine Environmental Science', degree: 'MPhil', fields: ['Atmosphere & Ocean'], link: 'https://oces.hkust.edu.hk/programs/master-philosophy-marine-environmental-science-mphil-mes', ...RPG },
      { name: 'MPhil/PhD in Atmospheric Environmental Science', degree: 'MPhil', fields: ['Atmosphere & Ocean', 'Physics'], link: 'https://envr.ust.hk/programs/research-postgraduate-program/mphil-phd-in-aes/program-objective.html', ...RPG },
      { name: 'MPhil in Mathematics', degree: 'MPhil', fields: ['Mathematics', 'Applied Mathematics'], link: 'https://www.math.hkust.edu.hk/pg/', ...RPG },
      { name: 'MPhil in Physics', degree: 'MPhil', fields: ['Physics'], link: 'https://physics.hkust.edu.hk/programs/postgraduate-programs/mphil-physics', ...RPG },
      { name: 'MPhil in Computer Science and Engineering', degree: 'MPhil', fields: ['Computer Science'], link: 'https://cse.hkust.edu.hk/pg/', ...RPG },
    ],
  },

  {
    name: 'CUHK',
    city: 'Hong Kong',
    country: 'Hong Kong SAR',
    checked_at: CHECKED,
    language: v('English', CUHK_REQ, 'all listed programmes are taught in English'),
    admissions: CUHK_REQ,
    scholarship: { level: 'unknown', value: null },
    english: v(
      'TOEFL iBT 79 — 4.5 on the 1–6 scale · IELTS 6.5',
      CUHK_REQ,
      'scores valid two years; waived for English-medium degrees',
    ),
    deadline: v(null),
    phd: {
      value: 'yes',
      note: 'Every listed department runs an MPhil–PhD stream, and HKPFS applies.',
      source: CUHK_SCI,
    },
    programs: [
      {
        name: 'MSc in Mathematics',
        fields: ['Mathematics', 'Applied Mathematics'],
        link: CUHK_MATH,
        duration: v('1 year full-time', CUHK_MATH),
        tuition: { non_eu: v('HK$168,960 / year', CUHK_MATH, 'full-time; HK$84,480 part-time') },
        deadline: v('Priority 31 Jan 2027, final 31 Mar 2027', CUHK_MATH, 'rolling until full'),
      },
      {
        name: 'MSc in Physics',
        fields: ['Physics'],
        link: CUHK_PHYS,
        admissions: 'https://wp.phy.cuhk.edu.hk/postgraduate-admissions/msc-in-physics',
        duration: v('1 year full-time', CUHK_PHYS),
        tuition: { non_eu: v('HK$199,200 / year', CUHK_PHYS, 'full-time; HK$99,600 part-time') },
        deadline: v('15 May 2027', CUHK_PHYS),
      },
      {
        name: 'MSc in Earth and Environmental Analytics for Sustainability',
        fields: ['Atmosphere & Ocean', 'Computational Science'],
        link: CUHK_EEAS,
        admissions: 'https://www.ees.cuhk.edu.hk/programme/postgraduate-programmes/msc-programme/',
        duration: v('1 year full-time', CUHK_EEAS),
        tuition: { non_eu: v('HK$200,000 whole programme', CUHK_EEAS) },
        deadline: v('Priority 31 Dec 2026, final 30 Apr 2027', CUHK_EEAS),
      },
      {
        name: 'MSc in Computer Science',
        fields: ['Computer Science'],
        link: CUHK_CS,
        admissions: 'https://msc.cse.cuhk.edu.hk/',
        duration: v('1 year full-time', CUHK_CS),
        tuition: { non_eu: v('HK$300,000 whole programme', CUHK_CS, 'full-time; HK$260,000 part-time') },
        deadline: v('31 January 2027', CUHK_CS),
      },
      { name: 'MSc in Advanced Studies in Statistics and Data Science', fields: ['Mathematics', 'Computational Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/msc-advanced-studies-statistics-and-data-science' },
      { name: 'MSc in Data Science and Business Statistics', fields: ['Computational Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/msc-data-science-and-business-statistics' },
      { name: 'MSc in Artificial Intelligence for Science', fields: ['Computational Science', 'Computer Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/msc-artificial-intelligence-science' },
      { name: 'MSc in Artificial Intelligence', fields: ['Computer Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-artificial-intelligence' },
      { name: 'MSc in Electronic Engineering', fields: ['Engineering'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-electronic-engineering' },
      { name: 'MSc in Microelectronics and Integrated Circuits', fields: ['Engineering', 'Applied Physics'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-microelectronics-and-integrated-circuits' },
      { name: 'MSc in Information Engineering', fields: ['Engineering', 'Computer Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-information-engineering' },
      { name: 'MSc in Mechanical and Automation Engineering', fields: ['Engineering'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-mechanical-and-automation-engineering' },
      { name: 'MSc in Robotics', fields: ['Engineering', 'Computer Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-robotics' },
      { name: 'MSc in Systems Engineering and Engineering Management', fields: ['Engineering', 'Applied Mathematics'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-systems-engineering-and-engineering-management' },
      { name: 'MSc in Biomedical Engineering', fields: ['Engineering'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/msc-biomedical-engineering' },

      { name: 'MPhil–PhD in Mathematics', degree: 'MPhil', fields: ['Mathematics', 'Applied Mathematics'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/mphil-phd-mathematics', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
      { name: 'MPhil–PhD in Physics', degree: 'MPhil', fields: ['Physics'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/mphil-phd-physics', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
      { name: 'MPhil–PhD in Earth and Environmental Sciences', degree: 'MPhil', fields: ['Atmosphere & Ocean'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/mphil-phd-earth-and-environmental-sciences', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
      { name: 'MPhil–PhD in Statistics', degree: 'MPhil', fields: ['Mathematics', 'Computational Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/science/mphil-phd-statistics', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
      { name: 'MPhil–PhD in Computer Science and Engineering', degree: 'MPhil', fields: ['Computer Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/mphil-phd-computer-science-and-engineering', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
      { name: 'MPhil–PhD in Mechanical and Automation Engineering', degree: 'MPhil', fields: ['Engineering'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/mphil-phd-mechanical-and-automation-engineering', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
      { name: 'MPhil–PhD in Information Engineering', degree: 'MPhil', fields: ['Engineering', 'Computer Science'], link: 'https://www.gs.cuhk.edu.hk/programmes/engineering/mphil-phd-information-engineering', scholarship: HKPFS_AWARD, tuition: CUHK_RPG_TUITION },
    ],
  },

  {
    name: 'University of Hong Kong',
    city: 'Hong Kong',
    country: 'Hong Kong SAR',
    checked_at: CHECKED,
    language: v('English', HKU_PHYS, 'English is the medium of instruction'),
    admissions: HKU_ENGLISH,
    scholarship: { level: 'unknown', value: null },
    english: v(
      'TOEFL iBT 80 \u2014 or 4.5 for tests from 21 Jan 2026 \u00b7 IELTS 6.0 with no subtest below 5.5',
      HKU_ENGLISH,
      'taught postgraduate minimum; programmes may set higher',
    ),
    deadline: v(null),
    phd: {
      value: 'yes',
      note: 'HKPFS applies: HK$344,400 a year plus HK$14,400 travel, 400 awards for 2027/28.',
      source: HKPFS,
    },
    programs: [
      {
        name: 'MSc in Physics',
        fields: ['Physics'],
        link: HKU_PHYS,
        duration: v('1 year full-time', HKU_PHYS),
        tuition: {
          non_eu: v('HK$200,000 whole programme', HKU_PHYS, '2026–27 intake; same rate for local and non-local'),
          eu: v('HK$200,000 whole programme', HKU_PHYS),
        },
        deadline: v('30 April 2026 for non-local applicants', HKU_PHYS, '2026–27 round — 2027–28 dates not yet published'),
      },
      { name: 'MSc in Space Science', fields: ['Physics', 'Applied Physics'], link: 'https://www.scifac.hku.hk/prospective/tpg/SpaceScience', admissions: HKU_SCI_LIST },
      { name: 'MSc in Applied Geosciences', fields: ['Atmosphere & Ocean'], link: 'https://www.scifac.hku.hk/prospective/tpg/MSAG', admissions: HKU_SCI_LIST },
      { name: 'MSc in Environmental Management', fields: ['Atmosphere & Ocean'], link: 'https://www.scifac.hku.hk/prospective/tpg/EnvMan', admissions: HKU_SCI_LIST },
      { name: 'MSc in Integrative Marine Ecology and Conservation', fields: ['Atmosphere & Ocean'], link: 'https://www.scifac.hku.hk/prospective/tpg/IMEC', admissions: HKU_SCI_LIST },
      { name: 'MSc in Artificial Intelligence', fields: ['Computer Science', 'Computational Science'], link: 'https://www.scifac.hku.hk/prospective/tpg/ArtificialIntelligence', admissions: HKU_SCI_LIST },
      {
        name: 'MSc in Computer Science',
        fields: ['Computer Science'],
        link: 'https://master.cds.hku.hk/msccs/',
        admissions: HKU_CS_REQ,
        duration: v('1 year full-time', HKU_CS_REQ),
        tuition: {
          non_eu: v('HK$334,800 whole programme', HKU_CS_REQ, '2026–27; HK$375,000 for the AI & Decentralized Technologies stream'),
          eu: v('HK$240,000 whole programme', HKU_CS_REQ, 'local rate'),
        },
        deadline: v('Main round 1 Dec 2025, clearing 30 Apr 2026', HKU_CS_REQ, '2026–27 round — 2027–28 dates not yet published'),
      },
      { name: 'MSc(Eng) in Civil Engineering', fields: ['Engineering'], link: 'https://www.civil.hku.hk/h4_pros_pg_prog_msc.html', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Infrastructure Engineering and Management', fields: ['Engineering'], link: 'https://www.civil.hku.hk/h4_pros_pg_prog_msc_iem.html', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Industrial Engineering and Logistics Management', fields: ['Engineering', 'Applied Mathematics'], link: 'https://www.dase.hku.hk/teaching-and-learning/prospective-students/master-of-science-in-engineering-in-industrial-engineering-and-logistics-management', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Robotics and Intelligent Systems', fields: ['Engineering', 'Computer Science'], link: 'https://www.dase.hku.hk/teaching-and-learning/prospective-students/master-of-science-in-engineering-in-robotics-and-intelligent-systems', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Electrical and Electronic Engineering', fields: ['Engineering'], link: 'https://www.eee.hku.hk/study/postgraduate', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Energy Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://www.eee.hku.hk/study/postgraduate/', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Mechanical Engineering', fields: ['Engineering'], link: 'https://mech.hku.hk/tpg/', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'MSc(Eng) in Microelectronics Science and Technology', fields: ['Engineering', 'Applied Physics'], link: 'https://mech.hku.hk/tpg/', admissions: HKU_ENGG_LIST, tuition: HKU_ENGG_TUITION },
      { name: 'Master of Data Science', fields: ['Computational Science', 'Computer Science'], link: 'https://portal.hku.hk/tpg-admissions/programme-details?programme=master-of-data-science-sci&mode=0', admissions: HKU_SCI_LIST },
      { name: 'Master of Statistics', fields: ['Mathematics', 'Computational Science'], link: 'https://portal.hku.hk/tpg-admissions/programme-details?programme=master-of-statistics-sci&mode=0', admissions: HKU_SCI_LIST },
    ],
  },
]
