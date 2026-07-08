import { useEffect, useMemo, useState } from 'react'
import type { Program } from './types'
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
import { FilterSidebar } from './components/FilterSidebar'
import { FieldSearch } from './components/FieldSearch'
import { ProgramIndex } from './components/ProgramIndex'
import { DeepDive } from './components/DeepDive'
import { AdvisorExplorer } from './components/AdvisorExplorer'
import { RequestFieldModal } from './components/RequestFieldModal'

type View = 'programs' | 'advisors'

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
  const [onlyMyList, setOnlyMyList] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const { myList, toggle: toggleMyList } = useMyList()
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

  // Fields whose data must be fetched. The advisor view searches across the
  // whole database, so entering it auto-selects every field.
  const neededPrimaries = useMemo(() => {
    if (view === 'advisors' && index) return new Set(index.fields.map((f) => f.primary))
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

  // Advisor view: every program in the database (discipline selection ignored);
  // the other sidebar filters (degree, region, GRE, fee) still apply.
  const advisorPrograms = useMemo(() => {
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

  // Keep a valid selection as filters change.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
    } else if (!filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const selected = filtered.find((p) => p.id === selectedId) ?? null
  const shown = view === 'advisors' ? advisorPrograms : filtered
  const facultyCount = shown.reduce((n, p) => n + p.faculty.length, 0)
  const stillLoading = loadingFields.size > 0

  const pickField = (primary: string) => {
    setFilters((f) => ({ ...f, primaries: new Set(f.primaries).add(primary) }))
    setView('programs')
  }

  const openProgram = (id: string) => {
    // Tick the program's field so the deep-dive is visible in the programs view.
    const prog = advisorPrograms.find((p) => p.id === id)
    if (prog && !selectedPrimaries.has(prog.discipline.primary)) {
      setFilters((f) => ({ ...f, primaries: new Set(f.primaries).add(prog.discipline.primary) }))
    }
    setSelectedId(id)
    setView('programs')
  }

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
            {(['programs', 'advisors'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 capitalize transition-colors ${
                  view === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

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
              />
            </>
          )
        ) : (
          <AdvisorExplorer
            programs={advisorPrograms}
            query={advisorQuery}
            onQueryChange={setAdvisorQuery}
            onOpenProgram={openProgram}
          />
        )}
      </div>

      {showRequest && <RequestFieldModal onClose={() => setShowRequest(false)} />}
    </div>
  )
}

export default App
