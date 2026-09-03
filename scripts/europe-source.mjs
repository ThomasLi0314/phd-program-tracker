// Source data for the Europe master's page. Expanded by build-europe.mjs.
//
// RULES FOR EDITING THIS FILE — the same ones the rest of the database follows:
//
//  1. Every value came off a page someone actually read. `null` means "not
//     stated on any page I read", and the UI prints that as "Unknown / Verify".
//     Never fill a null with a plausible number.
//  2. `source` is the page the value was read from, not a page that ought to
//     contain it. scripts/check-europe-links.mjs fetches every URL here.
//  3. University-level facts (tuition, scholarships, English thresholds) are
//     stated once on the university and inherited by its programmes, because
//     that is how the universities themselves publish them. Override on the
//     programme only when the programme page says something different.
//  4. Tuition is national law in most of Europe. If a university publishes no
//     figure of its own, leave `tuition` off entirely and let the country card
//     answer — the UI labels that "national rule" so nobody mistakes it for a
//     departmental check.

/** A sourced value. `v(null)` is an honest gap; anything else needs a source. */
const v = (value, source, note) => ({
  value: value ?? null,
  ...(note ? { note } : {}),
  ...(source ? { source } : {}),
})

const CHECKED = '2026-08-13'

export const META = {
  version: 2,
  generated_at: '2026-09-03',
  cycle: '2027 entry',
  note:
    'Taught master\'s programmes in Europe, Singapore and Hong Kong, in mathematics, applied and ' +
    'computational mathematics, atmosphere & ocean science, physics, applied physics, computer ' +
    'science and engineering. Tuition and funding rules change every year and several countries ' +
    'are mid-reform — every figure links to the page it was read from. Verify before you budget.',
}

// ─────────────────────────────────────────────────────────────────────────────
// National rules. These are what a programme inherits when it publishes no fee
// of its own — the normal case in Germany, France, Austria and Norway.
// ─────────────────────────────────────────────────────────────────────────────

const DAAD_COSTS = 'https://www.daad.de/en/studying-in-germany/living-in-germany/finances/'
const CAMPUS_FRANCE = 'https://www.campusfrance.org/en/tuition-fees-France'
const DELFT_FEES =
  'https://www.tudelft.nl/en/education/study-programme-orientation/practical-matters/tuition-fee-finances'
const ETH_FEES = 'https://ethz.ch/students/en/studies/financial/tuition-fees.html'
const KTH_FEES =
  'https://www.kth.se/en/studies/master/admissions/application-and-tuition-fees-for-master-s-studies-1.65817'
const NTNU_FEES = 'https://www.ntnu.edu/studies/tuition-fee'
const AALTO_FEES = 'https://www.aalto.fi/en/admission-services/scholarships-and-tuition-fees'
const TUM_FEES = 'https://www.tum.de/en/studies/fees/tuition'
const IMPERIAL_AM = 'https://www.imperial.ac.uk/study/courses/postgraduate-taught/applied-mathematics/'
const READING_MET =
  'https://www.reading.ac.uk/ready-to-study/study/2026/meteorology-and-climate-pg/msc-applied-meteorology'
const SOTON_OCEAN = 'https://www.southampton.ac.uk/courses/oceanography-masters-msc'
const CAMBRIDGE_P3 = 'https://www.maths.cam.ac.uk/postgrad/part-iii/prospective.html'
const DTU_FEES = 'https://www.dtu.dk/english/education/graduate/fees-and-funding'
const DTU_MSC = 'https://www.dtu.dk/english/education/graduate/msc-programmes'
const IPP = 'https://www.ip-paris.fr/en/education'
const POLIMI = 'https://www.polimi.it/en/education/laurea-magistrale-programmes/programme-detail'
const UIB_METOC = 'https://www4.uib.no/en/programmes/meteorology-and-oceanography-masters'
const AALTO_OPTIONS = 'https://www.aalto.fi/en/study-options'
const TUWIEN_FEES =
  'https://www.tuwien.at/en/studies/admission/students-union-fee-and-tuition-fee/tuition-fee'
const TUWIEN_MSC = 'https://www.tuwien.at/en/studies/studies/master-programmes'
const TUE_FEES =
  'https://www.tue.nl/en/education/become-a-tue-student/tuition-fees-and-other-study-costs/tuition-fee'
const UU_MATH = 'https://www.uu.nl/en/masters/mathematical-sciences'

export const COUNTRIES = [
  {
    country: 'Germany',
    code: 'DE',
    tuition: {
      eu: v('No tuition; €70–430 semester contribution', DAAD_COSTS, 'public universities'),
      non_eu: v(
        'Usually none — but see BW and TUM',
        DAAD_COSTS,
        'Baden-Württemberg €1,500/semester (KIT, Heidelberg, Stuttgart, Freiburg, Konstanz, Tübingen); TUM €4,000–6,000/semester',
      ),
    },
    living_cost: v('€992 per month blocked account for the student visa', DAAD_COSTS),
    scholarships: v(
      'DAAD scholarships and Deutschlandstipendium; most programmes charge no tuition to waive',
      DAAD_COSTS,
    ),
    note:
      'Still the cheapest serious option in Europe — but "Germany is free" is no longer reliably ' +
      'true for non-EU applicants. Baden-Württemberg has charged €1,500 per semester since 2017, and ' +
      'TUM began charging €4,000–6,000 per semester with the 2024/25 intake, the first Bavarian ' +
      'university to do so. Check the specific university, not the country.',
  },
  {
    country: 'Netherlands',
    code: 'NL',
    tuition: {
      eu: v('€2,694 per year (statutory fee, 2026–27)', DELFT_FEES, 'set nationally, same everywhere'),
      non_eu: v(
        'Institutional fee set per university — €25,306 to €25,633 per year (2026–27)',
        DELFT_FEES,
        'Utrecht €25,306 · TU Delft €25,633',
      ),
    },
    scholarships: v(null),
    note:
      'The statutory/institutional split is national law, but the institutional figure is set by ' +
      'each university and rose sharply for 2026–27 (TU Delft went from €22,290 to €25,633 in one year).',
  },
  {
    country: 'Switzerland',
    code: 'CH',
    tuition: {
      eu: v('CHF 730 per semester at ETH and EPFL', ETH_FEES, 'Swiss residents and qualifying EU/EFTA'),
      non_eu: v(
        'CHF 2,190 per semester at ETH and EPFL — tripled from autumn 2025',
        ETH_FEES,
        'students who move to Switzerland to study',
      ),
    },
    scholarships: v(
      'ETH Excellence Scholarship (ESOP): full tuition waiver plus CHF 12,000 per semester, ~60 awards a year',
      'https://ethz.ch/students/en/studies/financial/scholarships/excellencescholarship.html',
    ),
    note:
      'Even at the tripled rate Switzerland is far cheaper than the UK or the Netherlands, and ESOP ' +
      'is one of very few European master\'s awards that pays a living stipend rather than just ' +
      'waiving fees. Living costs are the highest in Europe.',
  },
  {
    country: 'Sweden',
    code: 'SE',
    tuition: {
      eu: v('No tuition for EU/EEA/Swiss citizens', KTH_FEES),
      non_eu: v(
        'Set per programme — SEK 360,000 total for most two-year KTH programmes',
        KTH_FEES,
        'plus a SEK 900 application fee',
      ),
    },
    scholarships: v(
      'KTH Scholarship covers tuition for one or two years; Swedish Institute scholarships cover tuition and living costs',
      'https://www.kth.se/en/studies/master/admissions/scholarships/kth-scholarship-1.72827',
    ),
    note: 'Applications go through the national portal universityadmissions.se, with one January deadline for the autumn intake.',
  },
  {
    country: 'Norway',
    code: 'NO',
    tuition: {
      eu: v('No tuition for EU/EEA/Swiss citizens', NTNU_FEES),
      non_eu: v(
        'NOK 205,600 per year for science and technology programmes at NTNU (2026–27)',
        NTNU_FEES,
        'category 2 of three; set per university',
      ),
    },
    scholarships: v(null),
    note:
      'Norway charged nobody tuition until autumn 2023. Non-EEA fees are new, vary by university and ' +
      'category, and scholarship provision has not caught up — check for funding before applying.',
  },
  {
    country: 'Finland',
    code: 'FI',
    tuition: {
      eu: v('No tuition for EU/EEA/Swiss citizens', AALTO_FEES),
      non_eu: v('€17,000 per year for technology programmes at Aalto (2025–26)', AALTO_FEES, 'set per university'),
    },
    scholarships: v(
      'Aalto University Scholarship waives 100% of tuition for the strongest applicants; no separate application',
      AALTO_FEES,
      'does not cover living costs',
    ),
    note:
      'Finnish universities publish high sticker fees and then waive them heavily on merit, so the ' +
      'listed figure is a poor predictor of what a strong applicant actually pays.',
  },
  {
    country: 'Austria',
    code: 'AT',
    tuition: {
      eu: v('€363.36 per semester', TUWIEN_FEES, 'only after the standard duration plus two tolerance semesters; free before that'),
      non_eu: v('€726.72 per semester', TUWIEN_FEES, 'from the first semester'),
    },
    scholarships: v(null),
    note:
      'The fee is set by the federal Universities Act and the Decree on Tuition Fee, so it is the same ' +
      'at every Austrian public university — TU Wien, Uni Wien, Graz and the rest. The ÖH students\' ' +
      'union fee is charged on top each semester. At roughly €1,450 a year this is one of the cheapest ' +
      'routes in Europe for a non-EU applicant.',
  },
  {
    country: 'Belgium',
    code: 'BE',
    tuition: {
      eu: v(null),
      non_eu: v(null),
    },
    scholarships: v(null),
    note:
      'Flemish and Walloon universities set their own non-EEA rates and they are not published on the ' +
      'programme pages read here. Check the tuition page of the specific university.',
  },
  {
    country: 'Denmark',
    code: 'DK',
    tuition: {
      eu: v('No tuition for EU/EEA/Swiss citizens', DTU_FEES),
      non_eu: v('€7,500 per semester at DTU — €30,000 for a two-year MSc', DTU_FEES, 'likely revised for the autumn 2026 intake'),
    },
    scholarships: v(
      'DTU publishes tuition fee waivers for international non-EU/EEA MSc students',
      'https://www.dtu.dk/english/education/graduate/fees-and-funding/tuition_fee_waivers',
    ),
    note: 'Denmark also charges an application fee and requires proof of funds for the residence permit.',
  },
  {
    country: 'Italy',
    code: 'IT',
    tuition: {
      eu: v(null),
      non_eu: v(null),
    },
    scholarships: v(null),
    note:
      'Italian public universities set tuition on a sliding scale tied to declared family income (the ' +
      'ISEE, or an ISEE-parificato for foreign families), so there is no single published figure — the ' +
      'same programme can cost a few hundred or a few thousand euros a year. Check each university\'s ' +
      'fee simulator with your own income band.',
  },
  {
    country: 'France',
    code: 'FR',
    tuition: {
      eu: v('€255 per year for a master\'s at a public university', CAMPUS_FRANCE),
      non_eu: v('€3,950 per year — the differentiated rate', CAMPUS_FRANCE, 'plus the CVEC student life contribution'),
    },
    scholarships: v(
      'French government scholarships (BGF) and exchange agreements carry a full automatic waiver of the differentiated fee',
      CAMPUS_FRANCE,
    ),
    note:
      'From 2026 institutions may waive the differentiated fee for at most 30% of their international ' +
      'students, so the waiver that many applicants used to receive automatically is now rationed. ' +
      'Grandes écoles set their own, much higher, fees.',
  },
  {
    country: 'United Kingdom',
    code: 'GB',
    tuition: {
      eu: v(
        'No EU rate since Brexit — EU applicants pay the Overseas rate unless they hold UK settled status',
        'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing',
      ),
      non_eu: v(
        'Set per university and per course — £43,730 per year for Oxford MMSC (2026–27)',
        'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing',
      ),
    },
    scholarships: v(null),
    note:
      'By far the most expensive option here, and most taught master\'s run 12 months rather than two ' +
      'years, so compare total cost rather than annual. Funding for taught master\'s is scarce.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Universities. `programs` inherit every university-level field above them.
// ─────────────────────────────────────────────────────────────────────────────

const ENGLISH = (source) => v('English', source)
const ETH_BASE = 'https://ethz.ch/en/studies/master/degree-programmes'
const ETH_NSM = `${ETH_BASE}/natural-sciences-and-mathematics`
const ETH_ENG = `${ETH_BASE}/engineering-sciences`
const ETH_SON = `${ETH_BASE}/system-oriented-natural-sciences`
const ETH_LIST = 'https://ethz.ch/students/en/studies/degree-programmes.html'

export const UNIVERSITIES = [
  {
    name: 'ETH Zürich',
    city: 'Zürich',
    country: 'Switzerland',
    checked_at: CHECKED,
    language: ENGLISH(ETH_LIST),
    tuition: {
      eu: v('CHF 730 / semester', ETH_FEES, 'Swiss residents, qualifying EU/EFTA'),
      non_eu: v('CHF 2,190 / semester', ETH_FEES, 'tripled from autumn 2025'),
    },
    tuitionLink: ETH_FEES,
    scholarship: {
      level: 'full',
      value: 'ESOP: full tuition waiver + CHF 12,000 per semester, ~60 awards a year; apply 1–30 November',
      source: 'https://ethz.ch/students/en/studies/financial/scholarships/excellencescholarship.html',
    },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'ETH awards its own doctorate; doctoral students are employed and salaried.', source: ETH_LIST },
    programs: [
      { name: 'Mathematics / Applied Mathematics', fields: ['Mathematics', 'Applied Mathematics'], link: `${ETH_NSM}/mathematics-applied-mathematics.html` },
      { name: 'Computational Science and Engineering', fields: ['Computational Science', 'Applied Mathematics'], link: `${ETH_NSM}/rechnergestuetzte-wissenschaften.html` },
      { name: 'Statistics', fields: ['Mathematics', 'Computational Science'], link: `${ETH_NSM}/statistics.html` },
      { name: 'Physics', fields: ['Physics'], link: `${ETH_NSM}/physics.html` },
      { name: 'High Energy Physics', fields: ['Physics'], link: `${ETH_NSM}/high-energy-physics.html` },
      { name: 'Quantum Engineering', fields: ['Applied Physics', 'Engineering'], link: `${ETH_NSM}/quantum-engineering.html` },
      { name: 'Computer Science', fields: ['Computer Science'], link: `${ETH_ENG}/computer-science.html` },
      { name: 'Data Science', fields: ['Computer Science', 'Computational Science'], link: `${ETH_ENG}/data-science.html` },
      { name: 'Cyber Security', fields: ['Computer Science'], link: `${ETH_ENG}/cyber-security.html` },
      { name: 'Electrical Engineering and Information Technology', fields: ['Engineering'], link: `${ETH_ENG}/electrical-engineering-and-information-technology.html` },
      { name: 'Mechanical Engineering', fields: ['Engineering'], link: `${ETH_ENG}/mechanical-engineering.html` },
      { name: 'Robotics, Systems and Control', fields: ['Engineering', 'Computer Science'], link: `${ETH_ENG}/robotics-systems-and-control.html` },
      { name: 'Energy Science and Technology', fields: ['Engineering', 'Applied Physics'], link: `${ETH_ENG}/energy-science-and-technology.html` },
      { name: 'Nuclear Engineering', fields: ['Engineering', 'Applied Physics'], link: `${ETH_ENG}/nuclear-engineering.html` },
      { name: 'Materials Science and Engineering', fields: ['Engineering', 'Applied Physics'], link: `${ETH_ENG}/materials-science.html` },
      {
        name: 'Atmospheric and Climate Science',
        fields: ['Atmosphere & Ocean', 'Physics'],
        link: `${ETH_SON}/atmosphaere-und-klima.html`,
        duration: v('3 semesters', 'https://eaps.ethz.ch/en/studies/master/atmospheric-climate-science.html'),
      },
      { name: 'Earth Sciences', fields: ['Atmosphere & Ocean'], link: `${ETH_SON}/earth-sciences.html` },
      { name: 'Applied Geophysics', fields: ['Atmosphere & Ocean', 'Applied Physics'], link: `${ETH_SON}/angewandte-geophysik.html` },
      { name: 'Environmental Sciences', fields: ['Atmosphere & Ocean'], link: `${ETH_SON}/environmental-sciences.html` },
      { name: 'Space Systems', fields: ['Engineering', 'Applied Physics'], link: `${ETH_SON}/space-systems.html` },
    ],
  },

  {
    name: 'EPFL',
    city: 'Lausanne',
    country: 'Switzerland',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('CHF 730 / semester', 'https://www.epfl.ch/education/studies/en/rules-and-procedures/study-taxes/tuition-fee-other-fees/', 'CHF 780 with compulsory extras'),
      non_eu: v('CHF 2,190 / semester', 'https://www.epfl.ch/education/studies/en/rules-and-procedures/study-taxes/tuition-fee-other-fees/', 'tripled from autumn 2025; CHF 2,240 with extras'),
    },
    tuitionLink: 'https://www.epfl.ch/education/studies/en/rules-and-procedures/study-taxes/tuition-fee-other-fees/',
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'EPFL runs salaried doctoral programmes admitting directly after the master\'s.', source: 'https://www.epfl.ch/education/phd/' },
    programs: [
      { name: 'Mathematics', fields: ['Mathematics'], link: 'https://www.epfl.ch/education/master/programs/mathematics/' },
      { name: 'Applied Mathematics', fields: ['Applied Mathematics'], link: 'https://www.epfl.ch/education/master/programs/applied-mathematics/' },
      { name: 'Computational Science and Engineering', fields: ['Computational Science', 'Applied Mathematics'], link: 'https://www.epfl.ch/education/master/programs/computational-science-and-engineering/' },
      { name: 'Statistics', fields: ['Mathematics', 'Computational Science'], link: 'https://www.epfl.ch/education/master/programs/statistics/' },
      { name: 'Physics', fields: ['Physics'], link: 'https://www.epfl.ch/education/master/programs/physics/' },
      { name: 'Applied Physics', fields: ['Applied Physics'], link: 'https://www.epfl.ch/education/master/programs/applied-physics/' },
      { name: 'Computer Science', fields: ['Computer Science'], link: 'https://www.epfl.ch/education/master/programs/computer-science/' },
      { name: 'Data Science', fields: ['Computer Science', 'Computational Science'], link: 'https://www.epfl.ch/education/master/programs/data-science/' },
      { name: 'Environmental Sciences and Engineering', fields: ['Atmosphere & Ocean', 'Engineering'], link: 'https://www.epfl.ch/education/master/programs/environmental-sciences-and-engineering/' },
      { name: 'Quantum Science and Engineering', fields: ['Applied Physics', 'Engineering'], link: 'https://www.epfl.ch/education/master/programs/quantum-science/' },
      { name: 'Mechanical Engineering', fields: ['Engineering'], link: 'https://www.epfl.ch/education/master/programs/mechanical-engineering/' },
      { name: 'Electrical and Electronic Engineering', fields: ['Engineering'], link: 'https://www.epfl.ch/education/master/programs/electrical-and-electronic-engineering/' },
      { name: 'Civil Engineering', fields: ['Engineering'], link: 'https://www.epfl.ch/education/master/programs/civil-engineering/' },
      { name: 'Materials Science and Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://www.epfl.ch/education/master/programs/materials-science-and-engineering/' },
      { name: 'Microengineering', fields: ['Engineering', 'Applied Physics'], link: 'https://www.epfl.ch/education/master/programs/microengineering/' },
      { name: 'Robotics', fields: ['Engineering', 'Computer Science'], link: 'https://www.epfl.ch/education/master/programs/robotics/' },
      { name: 'Energy Science and Technology', fields: ['Engineering', 'Applied Physics'], link: 'https://www.epfl.ch/education/master/programs/energy-science-and-technology/' },
      { name: 'Nuclear Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://www.epfl.ch/education/master/programs/nuclear-engineering/' },
      { name: 'Cyber Security', fields: ['Computer Science'], link: 'https://www.epfl.ch/education/master/programs/cyber-security/' },
      { name: 'Financial Engineering', fields: ['Applied Mathematics'], link: 'https://www.epfl.ch/education/master/programs/financial-engineering/' },
      { name: 'Neuro-X', fields: ['Computational Science', 'Engineering'], link: 'https://www.epfl.ch/education/master/programs/neuro-x/' },
    ],
  },

  {
    name: 'TU Delft',
    city: 'Delft',
    country: 'Netherlands',
    checked_at: CHECKED,
    language: v('English', 'https://www.tudelft.nl/en/education/programmes/masters', 'all TU Delft master\'s are taught in English'),
    duration: v('2 years (120 ECTS)', 'https://www.tudelft.nl/en/education/programmes/masters'),
    tuition: {
      eu: v('€2,694 / year', DELFT_FEES, 'statutory fee, 2026–27'),
      non_eu: v('€25,633 / year', DELFT_FEES, 'institutional fee, 2026–27; was €22,290 in 2025–26'),
    },
    tuitionLink: DELFT_FEES,
    scholarship: { level: 'unknown', value: null },
    english: v(
      'IELTS 7.0 (min 6.5 per section) · TOEFL iBT 5.0 (min 4.5 per section)',
      'https://www.tudelft.nl/en/education/admission-and-application/msc-international-diploma/admission-requirements',
      'TOEFL figures are on the new 1–6 scale used from January 2026',
    ),
    admissions: 'https://www.tudelft.nl/en/education/admission-and-application/msc-international-diploma/admission-requirements',
    deadline: v(null),
    phd: { value: 'yes', note: 'Dutch PhD positions are salaried jobs advertised as vacancies, not an admissions round.', source: 'https://www.tudelft.nl/en/education/programmes/phd' },
    programs: [
      { name: 'MSc Applied Mathematics', fields: ['Applied Mathematics', 'Computational Science'], link: 'https://www.tudelft.nl/en/education/programmes/masters/am/msc-applied-mathematics' },
      { name: 'MSc Applied Physics', fields: ['Applied Physics', 'Physics'], link: 'https://www.tudelft.nl/en/education/programmes/masters/ap/msc-applied-physics' },
      { name: 'MSc Computer Science', fields: ['Computer Science'], link: 'https://www.tudelft.nl/en/education/programmes/masters/cs/msc-computer-science' },
      { name: 'MSc Applied Geophysics', fields: ['Atmosphere & Ocean', 'Applied Physics'], link: 'https://www.tudelft.nl/en/education/programmes/masters/agp/msc-applied-geophysics' },
      { name: 'MSc Earth, Climate and Technology', fields: ['Atmosphere & Ocean'], link: 'https://www.tudelft.nl/en/education/programmes/masters/ect/msc-earth-climate-and-technology' },
      { name: 'MSc Aerospace Engineering', fields: ['Engineering', 'Applied Physics'], link: 'https://www.tudelft.nl/en/education/programmes/masters/ae/msc-aerospace-engineering' },
      { name: 'MSc Civil Engineering', fields: ['Engineering'], link: 'https://www.tudelft.nl/en/education/programmes/masters/cie/msc-civil-engineering' },
      { name: 'MSc Marine Technology', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://www.tudelft.nl/en/education/programmes/masters/mt/msc-marine-technology' },
      { name: 'MSc Offshore and Dredging Engineering', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://www.tudelft.nl/en/education/programmes/masters/ode/msc-offshore-dredging-engineering' },
      { name: 'MSc Systems and Control', fields: ['Engineering', 'Applied Mathematics'], link: 'https://www.tudelft.nl/en/education/programmes/masters/sc/msc-systems-control' },
      { name: 'MSc Robotics', fields: ['Engineering', 'Computer Science'], link: 'https://www.tudelft.nl/en/education/programmes/masters/robotics/msc-robotics' },
      { name: 'MSc Environmental Engineering', fields: ['Engineering', 'Atmosphere & Ocean'], link: 'https://www.tudelft.nl/en/education/programmes/masters/env/msc-environmental-engineering' },
    ],
  },

  {
    name: 'Utrecht University',
    city: 'Utrecht',
    country: 'Netherlands',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('€2,694 / year', 'https://www.uu.nl/en/masters/climate-physics', 'statutory fee, 2026–27'),
      non_eu: v('€25,306 / year', 'https://www.uu.nl/en/masters/climate-physics', 'institutional fee, 2026–27'),
    },
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Salaried PhD positions advertised as vacancies rather than an admissions round.', source: 'https://www.uu.nl/en/research/graduate-schools' },
    programs: [
      {
        name: 'MSc Climate Physics',
        fields: ['Atmosphere & Ocean', 'Physics'],
        link: 'https://www.uu.nl/en/masters/climate-physics',
        language: v('English', 'https://www.uu.nl/en/masters/climate-physics'),
        duration: v('2 years', 'https://www.uu.nl/en/masters/climate-physics', 'starts February or September; degree awarded in Physics'),
      },
      {
        name: 'MSc Mathematical Sciences',
        fields: ['Mathematics', 'Applied Mathematics', 'Computational Science'],
        link: UU_MATH,
        language: v('English', UU_MATH),
        duration: v('2 years full-time', UU_MATH, 'starts February or September; part of the national Mastermath collaboration'),
        tuition: {
          eu: v('€2,694 / year', UU_MATH, 'statutory fee, 2026–27'),
          non_eu: v('€25,306 / year', UU_MATH, 'institutional fee, 2026–27'),
        },
      },
    ],
  },

  {
    name: 'KTH Royal Institute of Technology',
    city: 'Stockholm',
    country: 'Sweden',
    checked_at: CHECKED,
    language: v('English', 'https://www.kth.se/en/studies/master/programmes', 'KTH offers 60 MSc programmes taught in English'),
    duration: v('2 years', 'https://www.kth.se/en/studies/master/programmes', 'starting each August'),
    tuition: {
      eu: v('No tuition', KTH_FEES, 'EU/EEA/Swiss citizens'),
      non_eu: v('SEK 360,000 total for most two-year programmes', KTH_FEES, 'plus a SEK 900 application fee; varies by programme'),
    },
    tuitionLink: KTH_FEES,
    scholarship: {
      level: 'full',
      value: 'KTH Scholarship covers tuition for one or two years; open to all fee-paying applicants',
      source: 'https://www.kth.se/en/studies/master/admissions/scholarships/kth-scholarship-1.72827',
    },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Swedish doctoral students are employed on a salary; positions are advertised as vacancies.', source: 'https://www.kth.se/en/studies/phd' },
    programs: [
      { name: 'Applied and Computational Mathematics', fields: ['Applied Mathematics', 'Computational Science', 'Mathematics'], link: 'https://www.kth.se/en/studies/master/applied-and-computational-mathematics' },
      { name: 'Mathematics', fields: ['Mathematics'], link: 'https://www.kth.se/en/studies/master/mathematics' },
      { name: 'Computer Simulations for Science and Engineering', fields: ['Computational Science', 'Applied Mathematics'], link: 'https://www.kth.se/en/studies/master/computer-simulations-for-science-and-engineering' },
      { name: 'Computer Science', fields: ['Computer Science'], link: 'https://www.kth.se/en/studies/master/computer-science' },
      { name: 'Machine Learning', fields: ['Computer Science', 'Computational Science'], link: 'https://www.kth.se/en/studies/master/machine-learning' },
      { name: 'Engineering Physics', fields: ['Applied Physics', 'Physics'], link: 'https://www.kth.se/en/studies/master/engineering-physics' },
      { name: 'Engineering Mechanics', fields: ['Engineering', 'Applied Mathematics'], link: 'https://www.kth.se/en/studies/master/engineering-mechanics' },
      { name: 'Electromagnetics, Fusion and Space Engineering', fields: ['Applied Physics', 'Engineering'], link: 'https://www.kth.se/en/studies/master/electromagnetics-fusion-and-space-engineering' },
    ],
  },

  {
    name: 'Universität Hamburg',
    city: 'Hamburg',
    country: 'Germany',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: null },
    programs: [
      {
        name: 'MSc Integrated Climate System Sciences',
        fields: ['Atmosphere & Ocean', 'Physics'],
        link: 'https://www.geo.uni-hamburg.de/en/studium/master/msc-icss.html',
        language: v('English', 'https://www.geo.uni-hamburg.de/en/studium/master/msc-icss.html'),
        duration: v('2 years', 'https://www.geo.uni-hamburg.de/en/studium/master/msc-icss.html'),
        deadline: v('15 February – 31 March', 'https://www.geo.uni-hamburg.de/en/studium/master/msc-icss.html', 'annual window'),
        english: v(
          'TOEFL iBT 90 (min 20 per section) · IELTS 6.5 · or CEFR C1',
          'https://www.geo.uni-hamburg.de/en/studium/master/msc-icss/admission.html',
        ),
        admissions: 'https://www.geo.uni-hamburg.de/en/studium/master/msc-icss/admission.html',
      },
    ],
  },

  {
    name: 'University of Oxford',
    city: 'Oxford',
    country: 'United Kingdom',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'The Mathematical Institute admits DPhil students; the MMSC is a common route in.', source: 'https://www.maths.ox.ac.uk/study-here/postgraduate-study' },
    programs: [
      {
        name: 'MSc in Mathematical Modelling and Scientific Computing',
        fields: ['Applied Mathematics', 'Computational Science'],
        link: 'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing',
        duration: v('12 months', 'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing'),
        tuition: {
          eu: v('£16,220 / year (Home rate)', 'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing', '2026–27; EU applicants normally pay the Overseas rate'),
          non_eu: v('£43,730 / year (Overseas rate)', 'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing', '2026–27'),
        },
        english: v(
          'IELTS 7.5 (min 7.0 per component) · TOEFL iBT 110',
          'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing',
          'Oxford\'s "higher level" requirement',
        ),
        deadline: v(
          'Closed for 2026–27; applications for 2027–28 entry not yet open',
          'https://www.ox.ac.uk/admissions/graduate/courses/msc-mathematical-modelling-and-scientific-computing',
        ),
      },
    ],
  },

  {
    name: 'Technical University of Munich (TUM)',
    city: 'Munich',
    country: 'Germany',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('No tuition', TUM_FEES, 'EU/EEA citizens; semester contribution still applies'),
      non_eu: v('€4,000–6,000 / semester', TUM_FEES, 'master\'s programmes, from winter 2024/25; the exact rate is set per programme'),
    },
    tuitionLink: TUM_FEES,
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Doctoral candidates are explicitly exempt from TUM\'s tuition fees.', source: TUM_FEES },
    programs: [
      { name: 'MSc Mathematics in Data Science', fields: ['Mathematics', 'Applied Mathematics', 'Computational Science'], link: 'https://www.cit.tum.de/en/cit/studies/degree-programs/master-mathematics-data-science/' },
      { name: 'MSc Mathematics in Science and Engineering', fields: ['Applied Mathematics', 'Computational Science'], link: 'https://www.cit.tum.de/en/cit/studies/degree-programs/master-mathematics-science-engineering/' },
      { name: 'MSc Data Engineering and Analytics', fields: ['Computer Science', 'Computational Science'], link: 'https://www.cit.tum.de/en/cit/studies/degree-programs/master-data-engineering-and-analytics/' },
      { name: 'MSc Aerospace', fields: ['Engineering', 'Applied Physics'], link: 'https://www.tum.de/en/studies/degree-programs/detail/aerospace-master-of-science-msc' },
      { name: 'MSc Aerospace Engineering', fields: ['Engineering'], link: 'https://www.tum.de/en/studies/degree-programs/detail/aerospace-engineering-master-of-science-msc' },
    ],
  },

  {
    name: 'Imperial College London',
    city: 'London',
    country: 'United Kingdom',
    checked_at: CHECKED,
    language: v(null),
    duration: v('1 year full-time', IMPERIAL_AM, '2 years part-time'),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Imperial admits PhD students in the same departments; the taught MSc is a common route.', source: 'https://www.imperial.ac.uk/study/courses/' },
    programs: [
      {
        name: 'MSc Applied Mathematics',
        fields: ['Applied Mathematics', 'Mathematics'],
        link: IMPERIAL_AM,
        tuition: {
          eu: v('£15,100 total (Home rate)', IMPERIAL_AM, '2026 entry; EU applicants normally pay Overseas'),
          non_eu: v('£39,900 total (Overseas rate)', IMPERIAL_AM, '2026 entry, for the whole 1-year course'),
        },
        deadline: v('Closed for 2026 entry; round 2 previously closed 7 January', IMPERIAL_AM),
      },
      { name: 'MSc Applied Computational Science and Engineering', fields: ['Computational Science', 'Applied Mathematics'], link: 'https://www.imperial.ac.uk/study/courses/postgraduate-taught/applied-computational-science/' },
      { name: 'MSc Computing', fields: ['Computer Science'], link: 'https://www.imperial.ac.uk/study/courses/postgraduate-taught/computing/' },
      { name: 'MSc Mathematics and Finance', fields: ['Applied Mathematics'], link: 'https://www.imperial.ac.uk/study/courses/postgraduate-taught/mathematics-finance/' },
    ],
  },

  {
    name: 'University of Reading',
    city: 'Reading',
    country: 'United Kingdom',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'partial', value: 'A number of scholarships are advertised for master\'s students; amounts not stated on the course page', source: READING_MET },
    english: v('IELTS 6.5 overall, no element below 5.5', READING_MET),
    deadline: v(null),
    phd: { value: 'yes', note: 'Reading\'s Department of Meteorology is one of the largest in the world and admits PhD students.', source: 'https://www.reading.ac.uk/meteorology/' },
    programs: [
      {
        name: 'MSc Applied Meteorology',
        fields: ['Atmosphere & Ocean', 'Physics'],
        link: READING_MET,
        duration: v('12 months full-time', READING_MET),
        tuition: {
          eu: v('£13,100 (UK/Ireland rate)', READING_MET, '2026/27'),
          non_eu: v('£31,650 (International rate)', READING_MET, '2026/27'),
        },
      },
      {
        name: 'MSc Applied Meteorology and Climate with Management',
        fields: ['Atmosphere & Ocean'],
        link: 'https://www.reading.ac.uk/ready-to-study/study/2026/meteorology-and-climate-pg/msc-applied-meteorology-and-climate-with-management',
      },
    ],
  },

  {
    name: 'University of Southampton',
    city: 'Southampton',
    country: 'United Kingdom',
    checked_at: CHECKED,
    language: v(null),
    scholarship: {
      level: 'partial',
      value: 'Ocean and Earth Science Postgraduate International Scholarship: £3,000 for international master\'s students',
      source: SOTON_OCEAN,
    },
    english: v('IELTS 6.5 overall, minimum 6.0 in each band', SOTON_OCEAN),
    deadline: v(null),
    phd: { value: 'yes', note: 'Ocean and Earth Science offers taught MSc, research MRes and PhD at the National Oceanography Centre.', source: 'https://www.noc.ac.uk/work-with-us/student-gateway' },
    programs: [
      {
        name: 'MSc Oceanography',
        fields: ['Atmosphere & Ocean'],
        link: SOTON_OCEAN,
        duration: v('1 year full-time', SOTON_OCEAN),
        tuition: {
          eu: v('£11,000 (UK rate)', SOTON_OCEAN, 'EU applicants pay the international rate'),
          non_eu: v('£31,200 (EU and international rate)', SOTON_OCEAN),
        },
        deadline: v('19 August 2026, midday UK time (international)', SOTON_OCEAN, 'UK applicants 2 September 2026'),
      },
      { name: 'MSc Ocean and Earth Science by Research', fields: ['Atmosphere & Ocean'], degree: 'MRes', link: 'https://www.southampton.ac.uk/courses/ocean-earth-science-by-research-masters-msc' },
    ],
  },

  {
    name: 'University of Cambridge',
    city: 'Cambridge',
    country: 'United Kingdom',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Part III is the standard preparation for, and route into, a Cambridge PhD in mathematics.', source: CAMBRIDGE_P3 },
    programs: [
      {
        name: 'MASt in Mathematics (Part III)',
        fields: ['Mathematics', 'Applied Mathematics'],
        degree: 'MASt',
        link: CAMBRIDGE_P3,
        duration: v('9 months', CAMBRIDGE_P3),
      },
    ],
  },

  {
    name: 'Aalto University',
    city: 'Espoo',
    country: 'Finland',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('No tuition', AALTO_FEES, 'EU/EEA/Swiss citizens'),
      non_eu: v('€17,000 / year', AALTO_FEES, 'technology programmes, 2025–26'),
    },
    tuitionLink: AALTO_FEES,
    scholarship: {
      level: 'full',
      value: 'Aalto University Scholarship waives 100% of tuition for the highest-ranked applicants; no separate application, but it must be selected during the admission period',
      source: AALTO_FEES,
    },
    english: v(null),
    deadline: v(null),
    phd: { value: null },
    programs: [
      { name: 'MSc Mathematics and Operations Research', fields: ['Mathematics', 'Applied Mathematics'], link: `${AALTO_OPTIONS}/masters-programme-in-mathematics-and-operations-research` },
      { name: 'MSc Computer, Communication and Information Sciences', fields: ['Computer Science', 'Computational Science'], link: 'https://www.aalto.fi/en/programmes/masters-programme-in-computer-communication-and-information-sciences' },
      { name: 'MSc Engineering Physics', fields: ['Applied Physics', 'Physics'], link: `${AALTO_OPTIONS}/masters-programme-in-engineering-physics` },
      { name: 'MSc Mechanical Engineering', fields: ['Engineering'], link: 'https://www.aalto.fi/en/study-options/mechanical-engineering-master-of-science-technology' },
      { name: 'MSc Advanced Energy Solutions', fields: ['Engineering', 'Applied Physics'], link: 'https://www.aalto.fi/en/programmes/masters-programme-in-advanced-energy-solutions' },
    ],
  },

  {
    name: 'NTNU',
    city: 'Trondheim',
    country: 'Norway',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('No tuition', NTNU_FEES, 'EU/EEA/Swiss citizens'),
      non_eu: v('NOK 205,600 / year', NTNU_FEES, 'category 2: natural sciences, technology, health, 2026–27'),
    },
    tuitionLink: NTNU_FEES,
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Norwegian PhD positions are salaried and exempt from tuition fees.', source: NTNU_FEES },
    programs: [],
  },

  {
    name: 'University of Bergen',
    city: 'Bergen',
    country: 'Norway',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v('4 January (non-EU/EEA/EFTA applicants)', UIB_METOC),
    phd: { value: 'yes', note: 'The Geophysical Institute and the Bjerknes Centre run doctoral research in climate and ocean science.', source: 'https://www.uib.no/en/gfi' },
    programs: [
      {
        name: 'Master\'s in Meteorology and Oceanography',
        fields: ['Atmosphere & Ocean', 'Physics'],
        link: UIB_METOC,
        duration: v('2 years (4 semesters)', UIB_METOC, 'starts in autumn'),
        // Four named directions, one of which is exactly the user's area.
        english: v(null),
      },
    ],
  },

  {
    name: 'TU Wien',
    city: 'Vienna',
    country: 'Austria',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('€363.36 / semester', TUWIEN_FEES, 'free within the standard duration plus two tolerance semesters'),
      non_eu: v('€726.72 / semester', TUWIEN_FEES, 'from the first semester, plus the ÖH fee'),
    },
    tuitionLink: TUWIEN_FEES,
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: null },
    programs: [
      {
        name: 'MSc Computational Science and Engineering',
        fields: ['Computational Science', 'Applied Mathematics'],
        link: `${TUWIEN_MSC}/computational-science-and-engineering`,
        language: v('English', `${TUWIEN_MSC}/computational-science-and-engineering`, 'some supplementary courses in German; B1 German recommended'),
        duration: v('4 semesters (120 ECTS)', `${TUWIEN_MSC}/computational-science-and-engineering`),
        english: v('CEFR B2 recommended', `${TUWIEN_MSC}/computational-science-and-engineering`),
      },
      { name: 'MSc Interdisciplinary Mathematics', fields: ['Mathematics', 'Applied Mathematics'], link: `${TUWIEN_MSC}/technical-mathematics` },
      { name: 'MSc Statistics – Probability – Mathematics in Economics', fields: ['Mathematics', 'Applied Mathematics'], link: `${TUWIEN_MSC}/technical-mathematics` },
      { name: 'MSc Technical Physics', fields: ['Physics', 'Applied Physics'], link: `${TUWIEN_MSC}/technical-physics` },
      { name: 'MSc Physical Energy and Measurement Engineering', fields: ['Applied Physics', 'Engineering'], link: `${TUWIEN_MSC}/technical-physics` },
      { name: 'MSc Data Science', fields: ['Computer Science', 'Computational Science'], link: `${TUWIEN_MSC}/computer-science` },
      { name: 'MSc Logic and Artificial Intelligence', fields: ['Computer Science'], link: `${TUWIEN_MSC}/computer-science` },
      { name: 'MSc Visual Computing', fields: ['Computer Science'], link: `${TUWIEN_MSC}/computer-science` },
      { name: 'MSc Embedded Computing Systems', fields: ['Computer Science', 'Engineering'], link: `${TUWIEN_MSC}/embedded-computing-systems` },
    ],
  },

  {
    name: 'KU Leuven',
    city: 'Leuven',
    country: 'Belgium',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: null },
    programs: [
      { name: 'Master of Mathematical Engineering', fields: ['Applied Mathematics', 'Computational Science', 'Engineering'], link: 'https://www.kuleuven.be/programmes/master-mathematical-engineering' },
      { name: 'Master of Mathematics', fields: ['Mathematics', 'Applied Mathematics'], link: 'https://www.kuleuven.be/programmes/master-mathematics' },
    ],
  },

  {
    name: 'Eindhoven University of Technology (TU/e)',
    city: 'Eindhoven',
    country: 'Netherlands',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('€2,694 / year', TUE_FEES, 'statutory fee, 2026–27'),
      non_eu: v('€21,700 / year', TUE_FEES, 'institutional fee, 2026–27'),
    },
    tuitionLink: TUE_FEES,
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: null },
    programs: [
      { name: 'MSc Industrial and Applied Mathematics', fields: ['Applied Mathematics', 'Computational Science'], link: 'https://www.tue.nl/en/education/graduate-school/master-industrial-and-applied-mathematics' },
      { name: 'MSc Applied Physics', fields: ['Applied Physics', 'Physics'], link: 'https://www.tue.nl/en/education/graduate-school/master-applied-physics' },
      { name: 'MSc Computer Science and Engineering', fields: ['Computer Science'], link: 'https://www.tue.nl/en/education/graduate-school/master-computer-science-and-engineering' },
      { name: 'MSc Mechanical Engineering', fields: ['Engineering'], link: 'https://www.tue.nl/en/education/graduate-school/master-mechanical-engineering' },
      { name: 'MSc Sustainable Energy Technology', fields: ['Engineering', 'Applied Physics'], link: 'https://www.tue.nl/en/education/graduate-school/master-sustainable-energy-technology' },
    ],
  },

  {
    name: 'Technical University of Denmark (DTU)',
    city: 'Kongens Lyngby',
    country: 'Denmark',
    checked_at: CHECKED,
    language: v(null),
    tuition: {
      eu: v('No tuition', DTU_FEES, 'EU/EEA/Swiss citizens'),
      non_eu: v('€7,500 / semester (€15,000 per year)', DTU_FEES, 'likely revised for the autumn 2026 intake'),
    },
    tuitionLink: DTU_FEES,
    scholarship: {
      level: 'partial',
      value: 'DTU offers tuition fee waivers to international non-EU/EEA MSc students',
      source: 'https://www.dtu.dk/english/education/graduate/fees-and-funding/tuition_fee_waivers',
    },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'Danish PhD positions are salaried and advertised as vacancies.', source: 'https://www.dtu.dk/english/education/phd' },
    programs: [
      { name: 'MSc Mathematical Modelling and Computation', fields: ['Applied Mathematics', 'Computational Science', 'Mathematics'], link: `${DTU_MSC}/mathematical-modelling-and-computation` },
      { name: 'MSc Engineering Physics', fields: ['Applied Physics', 'Physics'], link: `${DTU_MSC}/engineering-physics` },
      { name: 'MSc Computer Science and Engineering', fields: ['Computer Science'], link: `${DTU_MSC}/computer-science-and-engineering` },
      { name: 'MSc Earth and Space Physics and Engineering', fields: ['Atmosphere & Ocean', 'Applied Physics'], link: `${DTU_MSC}/earth-and-space-physics-and-engineering` },
      { name: 'MSc Wind Energy', fields: ['Engineering', 'Atmosphere & Ocean'], link: `${DTU_MSC}/wind-energy` },
      { name: 'MSc Sustainable Energy Systems', fields: ['Engineering'], link: `${DTU_MSC}/sustainable-energy-systems` },
    ],
  },

  {
    name: 'Institut Polytechnique de Paris',
    city: 'Palaiseau',
    country: 'France',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'IP Paris runs its own doctoral school across the five founding grandes écoles.', source: 'https://www.ip-paris.fr/en/education/phd-programs' },
    programs: [
      { name: 'MSc Applied Mathematics and Statistics', fields: ['Applied Mathematics', 'Mathematics'], link: `${IPP}/graduate-programs/masters-science/applied-mathematics-and-statistics-program` },
      { name: 'MSc Mathematics and Applications', fields: ['Mathematics', 'Applied Mathematics'], link: `${IPP}/graduate-programs/masters-science/mathematics-and-applications-program` },
      { name: 'MSc Physics', fields: ['Physics'], link: `${IPP}/graduate-programs/masters-science/physics-program` },
      { name: 'MSc Mechanics', fields: ['Engineering', 'Applied Mathematics'], link: `${IPP}/graduate-programs/masters-science/mechanics-program` },
      { name: 'MSc Energy', fields: ['Engineering', 'Applied Physics'], link: `${IPP}/graduate-programs/masters-science/energy-program` },
      { name: 'MSc Computer Science', fields: ['Computer Science'], link: `${IPP}/masters/computer-science-program` },
    ],
  },

  {
    name: 'Politecnico di Milano',
    city: 'Milan',
    country: 'Italy',
    checked_at: CHECKED,
    language: v(null),
    scholarship: { level: 'unknown', value: null },
    english: v(null),
    deadline: v(null),
    phd: { value: 'yes', note: 'PoliMi runs doctoral programmes in the same departments.', source: 'https://www.polimi.it/en/phd' },
    programs: [
      {
        name: 'MSc Mathematical Engineering',
        fields: ['Applied Mathematics', 'Computational Science', 'Mathematics'],
        link: `${POLIMI}/mathematical-engineering-1`,
        language: v('English', `${POLIMI}/mathematical-engineering-1`),
        duration: v('2 years', `${POLIMI}/mathematical-engineering-1`),
      },
      { name: 'MSc Engineering Physics', fields: ['Applied Physics', 'Physics'], link: `${POLIMI}/engineering-physics` },
    ],
  },
]
