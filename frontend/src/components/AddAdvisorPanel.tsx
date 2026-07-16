// Add an advisor from the Advisor list: paste their page, and the school +
// program are worked out for you.
//
// This replaces adding from inside a program's deep-dive. You normally find a
// professor first (a paper, a lab site, a recommendation) and only then ask
// which program they take students through — so the program shouldn't be
// something you must navigate to before you can start.
//
// Routing PROPOSES, the user DISPOSES: the school/program are always shown as
// editable dropdowns with an account of how they were picked, because a wrong
// silent assignment would file a real professor under the wrong program.
import { useMemo, useState } from 'react'
import type { Faculty, Program } from '../types'
import { UNKNOWN } from '../types'
import { aiActive, extractAdvisorFromPage } from '../lib/deepseek'
import { isProbablyUrl, mentionsName, readPage } from '../lib/pageReader'
import { routeAdvisor, type ProgramOption, type RouteResult } from '../lib/advisorRouting'

/** Slug that can't collide with an id already on the target program. */
function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'advisor'
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  return id
}

export function AddAdvisorPanel({
  programs,
  addedFaculty,
  onAdd,
  onClose,
  onOpenProgram,
}: {
  programs: Program[]
  addedFaculty: Record<string, Faculty[]>
  onAdd: (programId: string, f: Faculty) => void
  onClose: () => void
  onOpenProgram: (programId: string) => void
}) {
  const [name, setName] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [title, setTitle] = useState('')
  const [subField, setSubField] = useState('')
  const [tags, setTags] = useState('')
  const [summary, setSummary] = useState('')
  const [homepage, setHomepage] = useState('')
  const [scholar, setScholar] = useState('')

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<{ url: string; fetchedAt: number } | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [university, setUniversity] = useState('')
  const [programId, setProgramId] = useState('')
  const [added, setAdded] = useState<{ name: string; programId: string; program: string } | null>(null)

  const options: ProgramOption[] = useMemo(
    () =>
      programs.map((p) => ({
        id: p.id,
        university: p.university,
        program_name: p.program_name,
        primary: p.discipline.primary,
        subs: p.discipline.subs,
      })),
    [programs],
  )
  const universities = useMemo(
    () => [...new Set(options.map((o) => o.university))].sort(),
    [options],
  )
  /** Programs offered for the currently-chosen school, best match first. */
  const programChoices = useMemo(() => {
    if (!university) return []
    const routed = route?.candidates.filter((c) => c.university === university) ?? []
    if (routed.length) return routed
    return options
      .filter((o) => o.university === university)
      .sort((a, b) => a.program_name.localeCompare(b.program_name))
  }, [university, route, options])

  const fetchAndFill = async () => {
    if (!name.trim() || !isProbablyUrl(pageUrl)) return
    setBusy(true)
    setError(null)
    setSource(null)
    setAdded(null)
    try {
      setStatus('Reading the page…')
      const page = await readPage(pageUrl)
      if (!mentionsName(page.text, name)) {
        throw new Error(
          `That page never mentions “${name.trim().split(/\s+/).pop()}”. It's probably the wrong URL (a 404, a directory index, or another person).`,
        )
      }
      setStatus('Extracting the card…')
      const d = await extractAdvisorFromPage(name.trim(), page, { university: '', program: '' })
      if (d.title) setTitle(d.title)
      setSubField(d.sub_field)
      setTags(d.tags.join(', '))
      setSummary(d.summary)
      setHomepage(d.homepage || page.url)
      setScholar(d.scholar)
      if (d.pageName && d.pageName.toLowerCase() !== name.trim().toLowerCase()) setName(d.pageName)
      setSource({ url: page.url, fetchedAt: page.fetchedAt })

      setStatus('Working out the school and program…')
      const r = routeAdvisor(
        {
          url: page.url,
          university: d.university,
          department: d.department,
          subField: d.sub_field,
          tags: d.tags,
        },
        options,
      )
      setRoute(r)
      setUniversity(r.university ?? '')
      setProgramId(r.programId ?? '')
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!name.trim() || !programId) return
    const target = options.find((o) => o.id === programId)
    if (!target) return
    const prog = programs.find((p) => p.id === programId)
    const taken = new Set([
      ...(prog?.faculty ?? []).map((f) => f.id),
      ...(addedFaculty[programId] ?? []).map((f) => f.id),
    ])
    const fac: Faculty = {
      id: slugId(name, taken),
      name: name.trim(),
      title: title.trim(),
      sub_field: subField.trim() || 'Unspecified',
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      summary: summary.trim(),
      // Never inferred — an official statement is the only source for this.
      recruitment_status: UNKNOWN,
      links: { homepage: homepage.trim() || null, scholar: scholar.trim() || null },
      added: true,
      ...(source
        ? { source_url: source.url, fetched_at: new Date(source.fetchedAt).toISOString().slice(0, 10) }
        : {}),
    }
    onAdd(programId, fac)
    setAdded({ name: fac.name, programId, program: `${target.university} — ${target.program_name}` })
    // Reset for the next one; adding advisors is a batch activity.
    setName('')
    setPageUrl('')
    setTitle('')
    setSubField('')
    setTags('')
    setSummary('')
    setHomepage('')
    setScholar('')
    setSource(null)
    setRoute(null)
    setUniversity('')
    setProgramId('')
  }

  const input =
    'w-full rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200'
  const confTone =
    route?.confidence === 'high'
      ? 'text-emerald-700'
      : route?.confidence === 'low'
        ? 'text-amber-700'
        : 'text-rose-700'

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-slate-800">Add an advisor</h3>
        <button onClick={onClose} className="text-[11px] text-slate-400 hover:text-slate-600">
          close
        </button>
      </div>

      {added && (
        <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
          Added <b>{added.name}</b> to {added.program}.{' '}
          <button onClick={() => onOpenProgram(added.programId)} className="underline hover:text-emerald-900">
            Open the program →
          </button>
        </div>
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Professor name"
          autoFocus
          className={input}
        />
        <input
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="Their faculty page / homepage URL"
          onKeyDown={(e) => e.key === 'Enter' && void fetchAndFill()}
          className={input}
        />
        <button
          onClick={fetchAndFill}
          disabled={!name.trim() || !isProbablyUrl(pageUrl) || busy || !aiActive()}
          title={
            aiActive()
              ? 'Read that page, build the card from it, and work out the school + program'
              : 'Enable DeepSeek in the Overview tab first'
          }
          className="rounded bg-indigo-600 px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? 'Reading…' : '🌐 Fetch & fill'}
        </button>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Paste the professor's page — it's read for real and the card is built from what it actually
        says, then the school and program are worked out from it. DeepSeek can't browse, so a URL is
        what makes this sourced rather than recalled.
      </p>
      {!aiActive() && (
        <p className="mt-1 text-[11px] text-amber-700">
          Needs DeepSeek enabled (📊 Overview → DeepSeek settings). You can still fill everything in
          by hand below.
        </p>
      )}
      {status && <p className="mt-1 text-[11px] font-medium text-indigo-600">{status}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>}
      {source && (
        <p className="mt-1 text-[11px] text-emerald-700">
          ✓ Read{' '}
          <a href={source.url} target="_blank" rel="noreferrer" className="underline [overflow-wrap:anywhere]">
            {source.url}
          </a>
        </p>
      )}

      {/* Where they'll be filed. Always editable, always explained. */}
      <div className="mt-2.5 rounded border border-slate-200 bg-white p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            School &amp; program
          </span>
          {route && <span className={`text-[10px] font-medium ${confTone}`}>{route.note}</span>}
        </div>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          <select
            value={university}
            onChange={(e) => {
              setUniversity(e.target.value)
              setProgramId('')
            }}
            className={input}
          >
            <option value="">Select a school…</option>
            {universities.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            disabled={!university}
            className={`${input} disabled:bg-slate-50 disabled:text-slate-400`}
          >
            <option value="">{university ? 'Select a program…' : 'Pick a school first'}</option>
            {programChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.program_name}
              </option>
            ))}
          </select>
        </div>
        {route?.confidence === 'none' && route.candidates.length === 0 && (
          <p className="mt-1 text-[11px] leading-relaxed text-rose-700">
            This school isn't in the database, so there's no program to file them under. Ask me to
            add the school first.
          </p>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Assistant Professor)" className={input} />
        <input value={subField} onChange={(e) => setSubField(e.target.value)} placeholder="Sub-field" className={input} />
      </div>
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma-separated" className={`${input} mt-2`} />
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Research summary" rows={2} className={`${input} mt-2 resize-y`} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="Homepage URL (optional)" className={input} />
        <input value={scholar} onChange={(e) => setScholar(e.target.value)} placeholder="Google Scholar URL (optional)" className={input} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={add}
          disabled={!name.trim() || !programId}
          className="rounded bg-indigo-600 px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          Add advisor
        </button>
        <span className="text-[11px] leading-snug text-slate-400">
          {!programId && name.trim()
            ? 'Pick a school and program above to file them under.'
            : 'Stored in this browser only, marked unverified. Recruitment status always defaults to “Verify”.'}
        </span>
      </div>
    </div>
  )
}
