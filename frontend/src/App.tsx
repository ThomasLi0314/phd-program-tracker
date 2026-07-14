import { useEffect, useMemo, useState } from 'react'
import type { Faculty, Program } from './types'
import { fetchField, fetchIndex, type DataIndex } from './lib/dataLoader'
import {
  defaultFilters,
  programMatches,
  sortPrograms,
  type Facets,
  type Filters,
  type SortKey,
} from './lib/filters'
import { useMyList } from './lib/myList'
import { useStarredAdvisors } from './lib/starredAdvisors'
import { useAdvisorNotes } from './lib/advisorNotes'
import { useOutreach, type SyncProgress } from './lib/outreach'
import { useOverrides } from './lib/overrides'
import { connect as gmailConnect, disconnect as gmailDisconnect, ensureToken, loadClientId } from './lib/gmail'
import { FilterSidebar } from './components/FilterSidebar'
import { FieldSearch } from './components/FieldSearch'
import { ProgramIndex } from './components/ProgramIndex'
import { DeepDive } from './components/DeepDive'
import { AdvisorExplorer } from './components/AdvisorExplorer'
import { SchoolExplorer } from './components/SchoolExplorer'
import { StarredAdvisors } from './components/StarredAdvisors'
import { OutreachView } from './components/OutreachView'
import { OutreachOverview } from './components/OutreachOverview'
import { GmailConnect } from './components/GmailConnect'
import { RequestFieldModal } from './components/RequestFieldModal'

type View = 'programs' | 'advisors' | 'schools' | 'starred' | 'outreach' | 'overview'

function formatProgress(p: SyncProgress): string {
  if (p.phase === 'sent') return 'Scanning Sent mail…'
  if (p.phase === 'messages') return `Reading ${p.done}/${p.total} emails…`
  if (p.phase === 'replies') return `Checking replies ${p.done}/${p.total}…`
  if (p.phase === 'ai') return `AI reading replies ${p.done}/${p.total}…`
  if (p.phase === 'summary') return `Summarizing ${p.done}/${p.total} programs…`
  return 'Syncing…'
}

function App() {
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  /** field data chunks that have arrived, keyed by discipline primary */
  const [loaded, setLoaded] = useState<Record<string, Program[]>>({})
  /** primaries whose chunk fetch is in flight */
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())

  const [filters, setFilters] = useState<Filters>(() => defaultFilters(0))
  const [view, setView] = useState<View>('programs')
  const [sortBy, setSortBy] = useState<SortKey>('university')
  const [advisorQuery, setAdvisorQuery] = useState('')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [onlyMyList, setOnlyMyList] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const { myList, toggle: toggleMyList } = useMyList()
  const { levels: starLevels, setLevel: setStarLevel } = useStarredAdvisors()
  const { notes: advisorNotes, setNote: setAdvisorNote } = useAdvisorNotes()
  const outreach = useOutreach()
  const { overrides, setFacultyHomepage, setProgramPage } = useOverrides()
  const [gmailStatus, setGmailStatus] = useState<'disconnected' | 'connected'>('disconnected')
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [gmailError, setGmailError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchIndex()
      .then((idx) => {
        setIndex(idx)
        setFilters(defaultFilters(idx.feeCap))
      })
      .catch((err) => setIndexError(String(err)))
  }, [])

  const facets: Facets | null = useMemo(
    () =>
      index && {
        disciplines: index.fields.map((f) => ({
          primary: f.primary,
          subs: f.subs,
          count: f.count,
        })),
        degrees: index.degrees,
        regions: index.regions,
        feeCap: index.feeCap,
      },
    [index],
  )

  // Fields whose data must be present: checked primaries + primaries of checked subs.
  const selectedPrimaries = useMemo(() => {
    const s = new Set(filters.primaries)
    for (const key of filters.subs) s.add(key.split('|')[0])
    return s
  }, [filters.primaries, filters.subs])

  // Fields whose data must be fetched. The advisor and school views search
  // across the whole database, so entering them auto-selects every field.
  const neededPrimaries = useMemo(() => {
    if (view !== 'programs' && index) return new Set(index.fields.map((f) => f.primary))
    return selectedPrimaries
  }, [view, index, selectedPrimaries])

  // Lazy-load the chunk of every needed field that isn't loaded yet.
  useEffect(() => {
    if (!index) return
    for (const primary of neededPrimaries) {
      if (loaded[primary] || loadingFields.has(primary)) continue
      const entry = index.fields.find((f) => f.primary === primary)
      if (!entry) continue
      setLoadingFields((prev) => new Set(prev).add(primary))
      fetchField(entry.slug)
        .then((programs) => setLoaded((prev) => ({ ...prev, [primary]: programs })))
        .catch((err) => setIndexError(String(err)))
        .finally(() =>
          setLoadingFields((prev) => {
            const next = new Set(prev)
            next.delete(primary)
            return next
          }),
        )
    }
  }, [index, neededPrimaries, loaded, loadingFields])

  // Pool = programs of the selected fields that have arrived.
  const pool = useMemo(() => {
    const arr: Program[] = []
    for (const primary of selectedPrimaries) {
      const chunk = loaded[primary]
      if (chunk) arr.push(...chunk)
    }
    return arr
  }, [selectedPrimaries, loaded])

  const filtered = useMemo(() => {
    if (!facets) return []
    let result = pool.filter((p) => programMatches(p, filters, facets.feeCap))
    if (onlyMyList) result = result.filter((p) => myList.has(p.id))
    return sortPrograms(result, sortBy)
  }, [pool, filters, facets, onlyMyList, myList, sortBy])

  // Advisor/school views: every program in the database (discipline selection
  // ignored); the other sidebar filters (degree, region, GRE, fee) still apply.
  const fullPool = useMemo(() => {
    if (!facets || !index) return []
    const noDiscipline: Filters = { ...filters, primaries: new Set(), subs: new Set() }
    let result: Program[] = []
    for (const f of index.fields) {
      const chunk = loaded[f.primary]
      if (chunk) result = result.concat(chunk)
    }
    result = result.filter((p) => programMatches(p, noDiscipline, facets.feeCap))
    if (onlyMyList) result = result.filter((p) => myList.has(p.id))
    return sortPrograms(result, 'university')
  }, [facets, index, loaded, filters, onlyMyList, myList])

  // Every {faculty, program} across ALL loaded fields, ignoring sidebar filters —
  // used to auto-match sent emails and resolve outreach records to advisor cards.
  const outreachPool = useMemo(() => {
    const hits: { faculty: Faculty; program: Program }[] = []
    if (!index) return hits
    for (const f of index.fields) {
      const chunk = loaded[f.primary]
      if (!chunk) continue
      for (const p of chunk) for (const fac of p.faculty) hits.push({ faculty: fac, program: p })
    }
    return hits
  }, [index, loaded])

  // Keep a valid selection as filters change.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
    } else if (!filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const selected = filtered.find((p) => p.id === selectedId) ?? null
  const shown = view === 'programs' ? filtered : fullPool
  const facultyCount = shown.reduce((n, p) => n + p.faculty.length, 0)
  const stillLoading = loadingFields.size > 0

  const pickField = (primary: string) => {
    setFilters((f) => ({ ...f, primaries: new Set(f.primaries).add(primary) }))
    setView('programs')
  }

  const openProgram = (id: string) => {
    // Tick the program's field so the deep-dive is visible in the programs view.
    const prog = fullPool.find((p) => p.id === id)
    if (prog && !selectedPrimaries.has(prog.discipline.primary)) {
      setFilters((f) => ({ ...f, primaries: new Set(f.primaries).add(prog.discipline.primary) }))
    }
    setSelectedId(id)
    setView('programs')
  }

  const runSync = async () => {
    const clientId = loadClientId()
    if (!clientId) return
    setSyncing(true)
    setGmailError(null)
    try {
      await ensureToken(clientId)
      await outreach.sync(outreachPool, (p) => setSyncStatus(formatProgress(p)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setGmailError(msg)
      if (/expired|not connected|reconnect/i.test(msg)) setGmailStatus('disconnected')
    } finally {
      setSyncing(false)
      setSyncStatus(null)
    }
  }

  const handleConnect = async (clientId: string) => {
    setGmailError(null)
    try {
      const email = await gmailConnect(clientId)
      setGmailEmail(email)
      setGmailStatus('connected')
      void runSync()
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDisconnect = () => {
    gmailDisconnect()
    setGmailStatus('disconnected')
    setGmailEmail(null)
    setGmailError(null)
  }

  // Silently reconnect on load if we synced before and the 7-day grant is still valid.
  useEffect(() => {
    const clientId = loadClientId()
    const prior = outreach.state.selfEmail
    if (!clientId || !prior) return
    ensureToken(clientId)
      .then(() => {
        setGmailStatus('connected')
        setGmailEmail(prior)
      })
      .catch(() => {
        /* grant lapsed — user re-connects manually */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (indexError) {
    return (
      <div className="flex h-full items-center justify-center bg-white p-8 text-center">
        <div>
          <p className="text-sm font-medium text-rose-600">Failed to load the field index.</p>
          <p className="mt-1 text-xs text-slate-500">{indexError}</p>
        </div>
      </div>
    )
  }

  if (!index || !facets) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
        Loading field index…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white text-slate-900">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-2 text-white">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-[15px] font-bold tracking-tight">
            Grad Program & Faculty Intelligence Tracker
          </h1>
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300 ring-1 ring-inset ring-indigo-400/40">
            {index.meta.cycle} cycle
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded border border-slate-600 text-[11px] font-medium">
            {(['programs', 'advisors', 'schools', 'starred', 'outreach', 'overview'] as View[]).map(
              (v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 capitalize transition-colors ${
                    view === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {v === 'starred'
                    ? `★ Starred (${starLevels.size})`
                    : v === 'outreach'
                      ? `✉ Outreach (${Object.keys(outreach.state.records).length})`
                      : v === 'overview'
                        ? '📊 Overview'
                        : v}
                </button>
              ),
            )}
          </div>

          <GmailConnect
            status={gmailStatus}
            email={gmailEmail}
            lastSync={outreach.state.lastSync}
            syncing={syncing}
            syncStatus={syncStatus}
            error={gmailError}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={runSync}
          />

          <button
            onClick={() => setOnlyMyList((v) => !v)}
            className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
              onlyMyList
                ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Show only programs saved to My List (within loaded fields)"
          >
            ★ My List ({myList.size})
          </button>

          <button
            onClick={() => setShowRequest(true)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700"
            title="Suggest a new research field to add to the database"
          >
            + Request a field
          </button>

          <div className="text-[11px] tabular-nums text-slate-300">
            {stillLoading
              ? 'loading field data…'
              : `${shown.length} programs · ${facultyCount} faculty`}{' '}
            <span className="text-slate-400">
              · {index.total} in database · data {index.meta.generated_at}
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <FilterSidebar
          facets={facets}
          filters={filters}
          onChange={setFilters}
          matchCount={filtered.length}
          totalCount={index.total}
          metaNote={index.meta.note}
          fields={index.fields}
          loadingFields={loadingFields}
          onPickField={pickField}
        />
        {view === 'programs' ? (
          selectedPrimaries.size === 0 ? (
            <div className="flex min-w-0 flex-1 items-start justify-center overflow-y-auto bg-slate-50/40 px-6 py-16">
              <div className="w-full max-w-xl">
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  Pick a field to load its programs
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                  The database holds {index.total.toLocaleString()} programs across{' '}
                  {index.fields.length} fields — data loads per field so the site stays fast. Type
                  a field name below, or tick one in the left sidebar.
                </p>
                <div className="mt-4">
                  <FieldSearch fields={index.fields} onPick={pickField} large />
                </div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {index.fields.slice(0, 12).map((f) => (
                    <button
                      key={f.slug}
                      onClick={() => pickField(f.primary)}
                      className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-500 hover:text-indigo-700"
                    >
                      {f.primary}
                      <span className="ml-1 text-[10px] tabular-nums text-slate-400">{f.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <ProgramIndex
                programs={filtered}
                selectedId={selectedId}
                myList={myList}
                sortBy={sortBy}
                onSelect={setSelectedId}
                onToggleList={toggleMyList}
                onSortChange={setSortBy}
              />
              <DeepDive
                program={selected}
                inList={selected !== null && myList.has(selected.id)}
                onToggleList={() => selected && toggleMyList(selected.id)}
                levels={starLevels}
                onSetLevel={setStarLevel}
                notes={advisorNotes}
                onSetNote={setAdvisorNote}
                outreach={outreach.state.records}
                homepages={overrides.facultyHomepage}
                onSetHomepage={setFacultyHomepage}
                programPage={
                  selected
                    ? (overrides.programPage[selected.id] ?? selected.links.program ?? '')
                    : ''
                }
                onSetProgramPage={(u) => selected && setProgramPage(selected.id, u)}
              />
            </>
          )
        ) : view === 'advisors' ? (
          <AdvisorExplorer
            programs={fullPool}
            query={advisorQuery}
            onQueryChange={setAdvisorQuery}
            onOpenProgram={openProgram}
            levels={starLevels}
            onSetLevel={setStarLevel}
            notes={advisorNotes}
            onSetNote={setAdvisorNote}
            outreach={outreach.state.records}
            homepages={overrides.facultyHomepage}
            onSetHomepage={setFacultyHomepage}
          />
        ) : view === 'schools' ? (
          <SchoolExplorer
            programs={fullPool}
            query={schoolQuery}
            onQueryChange={setSchoolQuery}
            onOpenProgram={openProgram}
          />
        ) : view === 'starred' ? (
          <StarredAdvisors
            programs={fullPool}
            levels={starLevels}
            onSetLevel={setStarLevel}
            onOpenProgram={openProgram}
            notes={advisorNotes}
            onSetNote={setAdvisorNote}
            outreach={outreach.state.records}
            homepages={overrides.facultyHomepage}
            onSetHomepage={setFacultyHomepage}
          />
        ) : view === 'outreach' ? (
          <OutreachView
            pool={outreachPool}
            records={outreach.state.records}
            unlinked={outreach.state.unlinked}
            connected={gmailStatus === 'connected'}
            lastSync={outreach.state.lastSync}
            scanSince={outreach.state.scanSince}
            onSetScanSince={outreach.setScanSince}
            onAssign={outreach.assign}
            onAddManual={outreach.addManual}
            onSetReplyType={outreach.setReplyType}
            onDismiss={outreach.dismiss}
            onUnassign={outreach.unassign}
            onOpenProgram={openProgram}
          />
        ) : (
          <OutreachOverview
            pool={outreachPool}
            records={outreach.state.records}
            programSummaries={outreach.state.programSummaries}
            onOpenProgram={openProgram}
          />
        )}
      </div>

      {showRequest && <RequestFieldModal onClose={() => setShowRequest(false)} />}
    </div>
  )
}

export default App
