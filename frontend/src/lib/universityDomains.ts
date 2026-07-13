// Best-effort university → root email domain(s) for the schools in the dataset.
// Used ONLY to seed the auto-match *guess* when linking a sent email to a
// professor; the authoritative link comes from the user confirming once, after
// which the learned address book (outreach.ts) remembers the exact address.
// A recipient domain matches if it equals or is a sub-domain of a root here
// (e.g. cs.stanford.edu matches stanford.edu).

export const UNIVERSITY_DOMAINS: Record<string, string[]> = {
  'Boston College': ['bc.edu'],
  'Boston University': ['bu.edu'],
  'Brown University': ['brown.edu'],
  'California Institute of Technology': ['caltech.edu'],
  Caltech: ['caltech.edu'],
  'Carnegie Mellon University': ['cmu.edu', 'andrew.cmu.edu'],
  'Columbia University': ['columbia.edu'],
  'Cornell University': ['cornell.edu'],
  'Dartmouth College': ['dartmouth.edu'],
  'Duke University': ['duke.edu'],
  'ETH Zürich': ['ethz.ch'],
  'ETH Zürich (Swiss Federal Institute of Technology Zurich)': ['ethz.ch'],
  'Emory University': ['emory.edu'],
  'Georgetown University': ['georgetown.edu'],
  'Georgia Institute of Technology': ['gatech.edu'],
  'Harvard University': ['harvard.edu'],
  'Imperial College London': ['imperial.ac.uk'],
  'Johns Hopkins University': ['jhu.edu'],
  'Lehigh University': ['lehigh.edu'],
  'MIT–WHOI Joint Program': ['mit.edu', 'whoi.edu'],
  'Massachusetts Institute of Technology': ['mit.edu'],
  'New York University': ['nyu.edu'],
  'New York University (Courant)': ['nyu.edu', 'cims.nyu.edu'],
  'New York University — Courant Institute': ['nyu.edu', 'cims.nyu.edu'],
  'Northeastern University': ['northeastern.edu'],
  'Northwestern University': ['northwestern.edu'],
  'Princeton University': ['princeton.edu'],
  'Purdue University': ['purdue.edu'],
  'Rice University': ['rice.edu'],
  'Rutgers University-New Brunswick': ['rutgers.edu'],
  'Stanford University': ['stanford.edu'],
  'The Ohio State University': ['osu.edu'],
  'Tufts University': ['tufts.edu'],
  'University College London': ['ucl.ac.uk'],
  'University of Bonn': ['uni-bonn.de'],
  'University of British Columbia': ['ubc.ca'],
  'University of California, Berkeley': ['berkeley.edu'],
  'University of California, Davis': ['ucdavis.edu'],
  'University of California, Irvine': ['uci.edu'],
  'University of California, Los Angeles': ['ucla.edu'],
  'University of California, San Diego': ['ucsd.edu'],
  'University of California, Santa Barbara': ['ucsb.edu'],
  'University of Cambridge': ['cam.ac.uk'],
  'University of Chicago': ['uchicago.edu'],
  'University of Florida': ['ufl.edu'],
  'University of Georgia': ['uga.edu'],
  'University of Illinois Urbana-Champaign': ['illinois.edu'],
  'University of Maryland, College Park': ['umd.edu'],
  'University of Michigan, Ann Arbor': ['umich.edu'],
  'University of North Carolina at Chapel Hill': ['unc.edu'],
  'University of Notre Dame': ['nd.edu'],
  'University of Oxford': ['ox.ac.uk'],
  'University of Pennsylvania': ['upenn.edu', 'seas.upenn.edu'],
  'University of Rochester': ['rochester.edu'],
  'University of Southern California': ['usc.edu'],
  'University of Texas at Austin': ['utexas.edu'],
  'University of Toronto': ['utoronto.ca'],
  'University of Tübingen': ['uni-tuebingen.de'],
  'University of Virginia': ['virginia.edu'],
  'University of Washington': ['uw.edu', 'washington.edu'],
  'University of Wisconsin-Madison': ['wisc.edu'],
  'Utrecht University': ['uu.nl'],
  'Vanderbilt University': ['vanderbilt.edu'],
  'Washington University in St. Louis': ['wustl.edu'],
  'Yale University': ['yale.edu'],
  'École polytechnique fédérale de Lausanne': ['epfl.ch'],
}

/** True if `emailDomain` equals or is a sub-domain of any known root domain of
 *  `university`. Unknown universities return false (guess falls back to name-only). */
export function domainMatchesUniversity(emailDomain: string, university: string): boolean {
  const roots = UNIVERSITY_DOMAINS[university]
  if (!roots) return false
  const d = emailDomain.toLowerCase()
  return roots.some((root) => d === root || d.endsWith(`.${root}`))
}
