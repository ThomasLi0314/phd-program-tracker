import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { groupSubs } from './lib/subfields'
import { useMyList } from './lib/myList'
import { useSchoolTiers } from './lib/schoolTiers'
import { useSidebarFields } from './lib/sidebarFields'
import { advisorKey, useStarredAdvisors } from './lib/starredAdvisors'
import { mergeKey } from './lib/mergeAdvisors'
import { useAdvisorNotes } from './lib/advisorNotes'
import { useOutreach, type SyncProgress } from './lib/outreach'
import { useOverrides } from './lib/overrides'
import { applyBackup, exportBackup, isLocalEmpty } from './lib/backup'
import { buildRequests } from './lib/advisorRequests'
import {
  driveBackupTime,
  loadFromDrive,
  loadSyncEnabled,
  saveSyncEnabled,
  saveToDrive,
} from './lib/drive'
import { connect as gmailConnect, disconnect as gmailDisconnect, ensureToken, loadClientId } from './lib/gmail'
import { navigate, useHashRoute } from './lib/hashRoute'
import { withOverrides } from './lib/applyOverrides'
import { loadProgramDocs, saveProgramDocs } from './lib/programDocs'
import type { ProgramDoc, ProgramDocMap } from './lib/programDocs'
import { usePref } from './lib/viewPrefs'
import { addProgramToPlan, usePlanSnapshot } from './lib/planBridge'
import { parseLocation, pathFor, PrimaryNav, SubNav, type Section } from './components/AppNav'
import { FilterSidebar } from './components/FilterSidebar'
import { ActiveFilters } from './components/ActiveFilters'
import { FieldSearch } from './components/FieldSearch'
import { ProgramIndex } from './components/ProgramIndex'
import { DeepDive } from './components/DeepDive'
import { AdvisorExplorer } from './components/AdvisorExplorer'
import { SchoolExplorer } from './components/SchoolExplorer'
import { SavedAdvisors } from './components/SavedAdvisors'
import { SavedPrograms } from './components/SavedPrograms'
import { OutreachView } from './components/OutreachView'
import { OutreachOverview } from './components/OutreachOverview'
import { SettingsView } from './components/SettingsView'
import { RequestFieldModal } from './components/RequestFieldModal'

function formatProgress(p: SyncProgress): string {
  if (p.phase === 'sent') return 'Scanning Sent mail…'
  if (p.phase === 'messages') return `Reading ${p.done}/${p.total} emails…`
  if (p.phase === 'replies') return `Checking replies ${p.done}/${p.total}…`
  if (p.phase === 'ai') return `AI reading replies ${p.done}/${p.total}…`
  if (p.phase === 'summary') return `Summarizing ${p.done}/${p.total} programs…`
  return 'Syncing…'
}

function App() {
  // Where we are — the hash is the source of truth, so a reload or Back
  // lands on the same tab rather than the default one.
  const route = useHashRoute()
  const loc = useMemo(() => parseLocation(route), [route])
  const go = useCallback((section: Section, view?: string) => navigate(pathFor(section, view)), [])

  const [index, setIndex] = useState<DataIndex | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  /** field data chunks that have arrived, keyed by discipline primary */
  const [loaded, setLoaded] = useState<Record<string, Program[]>>({})
  /** primaries whose chunk fetch is in flight */
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())
  /** primaries whose chunk fetch failed. Kept separate from indexError: one bad
   *  chunk must not blow away the whole UI (and the user's unsaved edits). */
  const [failedFields, setFailedFields] = useState<Map<string, string>>(new Map())

  const [filters, setFilters] = useState<Filters>(() => defaultFilters(0))
  const [sortBy, setSortBy] = useState<SortKey>('university')
  const [advisorQuery, setAdvisorQuery] = useState('')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [showRequest, setShowRequest] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = usePref('sidebarCollapsed', false)
  const { myList: savedPrograms, toggle: toggleSaved } = useMyList()
  const { tiers, setTier } = useSchoolTiers()
  const sidebarFields = useSidebarFields()
  const { levels: starLevels, setLevel: setStarLevel } = useStarredAdvisors()
  const { notes: advisorNotes, setNote: setAdvisorNote } = useAdvisorNotes()
  const outreach = useOutreach()
  const plan = usePlanSnapshot()
  const {
    overrides,
    setFacultyHomepage,
    setProgramPage,
    setProgramContact,
    setProgramField,
    addFaculty,
    removeFaculty,
  } = useOverrides()
  const [gmailStatus, setGmailStatus] = useState<'disconnected' | 'connected'>('disconnected')
  // programId -> the Google Doc holding that program's note.
  const [programDocs, setProgramDocs] = useState<ProgramDocMap>(loadProgramDocs)

  const linkProgramDoc = useCallback((programId: string, doc: ProgramDoc) => {
    setProgramDocs((prev) => {
      const next = { ...prev, [programId]: doc }
      saveProgramDocs(next)
      return next
    })
  }, [])

  const unlinkProgramDoc = useCallback((programId: string) => {
    setProgramDocs((prev) => {
      const next = { ...prev }
      delete next[programId]
      saveProgramDocs(next)
      return next
    })
  }, [])
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [gmailError, setGmailError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [driveSync, setDriveSync] = useState(loadSyncEnabled)
  const [driveStatus, setDriveStatus] = useState<string | null>(null)
  const [driveTime, setDriveTime] = useState<string | null>(null)
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
          // Merged sub-fields: "Applied Math" and "Applied Mathematics" are
          // one checkbox — see lib/subfields.
          subs: groupSubs(f.subs),
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

  // Every view except Explore → Programs searches the whole database.
  const wholeDatabase =
    loc.section === 'saved' ||
    loc.section === 'contact' ||
    (loc.section === 'explore' && loc.view !== 'programs')

  const neededPrimaries = useMemo(() => {
    if (wholeDatabase && index) return new Set(index.fields.map((f) => f.primary))
    return selectedPrimaries
  }, [wholeDatabase, index, selectedPrimaries])

  // Lazy-load the chunk of every needed field that isn't loaded yet.
  useEffect(() => {
    if (!index) return
    for (const primary of neededPrimaries) {
      if (loaded[primary] || loadingFields.has(primary) || failedFields.has(primary)) continue
      const entry = index.fields.find((f) => f.primary === primary)
      if (!entry) continue
      setLoadingFields((prev) => new Set(prev).add(primary))
      fetchField(entry.slug)
        .then((programs) => {
          setLoaded((prev) => ({ ...prev, [primary]: programs }))
          setFailedFields((prev) => {
            if (!prev.has(primary)) return prev
            const next = new Map(prev)
            next.delete(primary)
            return next
          })
        })
        .catch((err) => setFailedFields((prev) => new Map(prev).set(primary, String(err))))
        .finally(() =>
          setLoadingFields((prev) => {
            const next = new Set(prev)
            next.delete(primary)
            return next
          }),
        )
    }
  }, [index, neededPrimaries, loaded, loadingFields, failedFields])

  /** Retry a chunk that failed — dataLoader evicts the rejected promise, so a
   *  simple state clear is enough to make the effect above fetch it again. */
  const retryField = (primary: string) =>
    setFailedFields((prev) => {
      const next = new Map(prev)
      next.delete(primary)
      return next
    })

  // Pool = programs of the selected fields that have arrived, with the user's
  // own requirement edits folded in. Folding here keeps the list card, the
  // filters and the sort agreeing with the detail panel.
  const pool = useMemo(() => {
    const arr: Program[] = []
    for (const primary of selectedPrimaries) {
      const chunk = loaded[primary]
      if (chunk) arr.push(...chunk)
    }
    return withOverrides(arr, overrides.programFields)
  }, [selectedPrimaries, loaded, overrides.programFields])

  const filtered = useMemo(() => {
    if (!facets || !index) return []
    return sortPrograms(
      pool.filter((p) => programMatches(p, filters, facets.feeCap)),
      sortBy,
    )
  }, [pool, filters, facets, index, sortBy])

  // Advisor/school/saved views: every program in the database (discipline
  // selection ignored); the other sidebar filters (degree, region, GRE, fee)
  // still apply.
  const fullPool = useMemo(() => {
    if (!facets || !index) return []
    const noDiscipline: Filters = { ...filters, primaries: new Set(), subs: new Set() }
    let result: Program[] = []
    for (const f of index.fields) {
      const chunk = loaded[f.primary]
      if (chunk) result = result.concat(chunk)
    }
    result = withOverrides(result, overrides.programFields)
    result = result.filter((p) => programMatches(p, noDiscipline, facets.feeCap))
    return sortPrograms(result, 'university')
  }, [facets, index, loaded, filters, overrides.programFields])

  // Every saved program across ALL loaded fields, no other filters — the Saved
  // table ignores discipline/degree/region/fee and ranks by the user's tiers.
  const savedProgramList = useMemo(() => {
    if (!index) return []
    const out: Program[] = []
    for (const f of index.fields) {
      const chunk = loaded[f.primary]
      if (!chunk) continue
      for (const p of chunk) if (savedPrograms.has(p.id)) out.push(p)
    }
    return withOverrides(out, overrides.programFields)
  }, [index, loaded, savedPrograms, overrides.programFields])

  // Every {faculty, program} across ALL loaded fields, ignoring sidebar filters —
  // used to auto-match sent emails and resolve contact records to advisor cards.
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

  // Starring a professor writes to every program entry they appear under, so the
  // raw key count double-counts people. The Saved tab lists merged people, and
  // the badge must agree with it. Before the chunks land there's nothing to merge
  // against, so fall back to the raw count rather than flashing a wrong number.
  const savedAdvisorCount = useMemo(() => {
    if (starLevels.size === 0) return 0
    const starred = outreachPool.filter((h) => starLevels.has(advisorKey(h.program.id, h.faculty.id)))
    if (starred.length === 0) return starLevels.size
    return new Set(starred.map((h) => mergeKey(h.faculty.name, h.program.university))).size
  }, [outreachPool, starLevels])

  // Locally-added advisors, packaged as a merge request. Resolved against the
  // whole database so each request carries its university/program name.
  const advisorRequests = useMemo(() => {
    const byId = new Map(outreachPool.map((h) => [h.program.id, h.program]))
    return buildRequests(overrides.addedFaculty, (programId) => {
      const p = byId.get(programId)
      return p ? { university: p.university, program: p.program_name } : null
    })
  }, [overrides.addedFaculty, outreachPool])

  // Keep a valid selection as filters change.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
    } else if (!filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const selected = filtered.find((p) => p.id === selectedId) ?? null
  const stillLoading = loadingFields.size > 0
  /** A ticked field whose chunk hasn't arrived — the list is not yet true. */
  const selectedLoading = [...selectedPrimaries].some((p) => loadingFields.has(p))
  // The whole-database views need every field chunk. Until they've all arrived,
  // an empty result means "not loaded yet", not "you have nothing". A failed
  // field counts as settled: the retry banner reports it.
  const poolIncomplete =
    stillLoading ||
    !index ||
    index.fields.some((f) => !loaded[f.primary] && !failedFields.has(f.primary))

  // Picking a field both lists it in the sidebar and ticks it.
  const pickField = (primary: string) => {
    sidebarFields.show(primary)
    setFilters((f) => ({ ...f, primaries: new Set(f.primaries).add(primary) }))
    go('explore', 'programs')
  }

  const openProgram = (id: string) => {
    // Tick the program's field so the detail is visible in the programs view.
    const prog = fullPool.find((p) => p.id === id) ?? savedProgramList.find((p) => p.id === id)
    if (prog && !selectedPrimaries.has(prog.discipline.primary)) {
      sidebarFields.show(prog.discipline.primary)
      setFilters((f) => ({ ...f, primaries: new Set(f.primaries).add(prog.discipline.primary) }))
    }
    setSelectedId(id)
    go('explore', 'programs')
  }

  const addToPlan = async (p: Program) => {
    await addProgramToPlan(p)
    plan.refresh()
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

  /** Write the current snapshot to the Drive app-data folder. */
  const doDriveBackup = async (silent = false) => {
    const clientId = loadClientId()
    if (!clientId) return
    if (!silent) setDriveStatus('Backing up…')
    try {
      const token = await ensureToken(clientId)
      await saveToDrive(token, exportBackup())
      setDriveTime(new Date().toISOString())
      if (!silent) setDriveStatus('Backed up to Drive ✓')
    } catch (e) {
      setDriveStatus(`Drive backup failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doDriveRestore = async () => {
    const clientId = loadClientId()
    if (!clientId) return
    setDriveStatus('Reading Drive…')
    try {
      const token = await ensureToken(clientId)
      const b = await loadFromDrive(token)
      if (!b) {
        setDriveStatus('No backup found in Drive yet.')
        return
      }
      if (!confirm('Replace this browser’s data with the Google Drive backup, then reload?')) {
        setDriveStatus(null)
        return
      }
      applyBackup(b)
      location.reload()
    } catch (e) {
      setDriveStatus(`Restore failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleConnect = async (clientId: string) => {
    setGmailError(null)
    try {
      const email = await gmailConnect(clientId)
      setGmailEmail(email)
      setGmailStatus('connected')
      // Fresh browser with nothing saved? Offer the Drive backup before anything else.
      if (isLocalEmpty()) {
        try {
          const b = await loadFromDrive(await ensureToken(clientId))
          if (b && confirm('Found a saved backup in your Google Drive. Restore it now?')) {
            applyBackup(b)
            location.reload()
            return
          }
        } catch {
          /* no drive backup / scope not granted */
        }
      }
      void runSync()
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : String(e))
    }
  }

  // Auto-backup to Drive (debounced) whenever user data changes.
  useEffect(() => {
    if (!driveSync || gmailStatus !== 'connected') return
    const t = setTimeout(() => void doDriveBackup(true), 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveSync, gmailStatus, savedPrograms, tiers, starLevels, advisorNotes, outreach.state, overrides])

  // Show when the Drive backup was last written, when Settings opens.
  useEffect(() => {
    if (loc.section !== 'settings' || gmailStatus !== 'connected') return
    const clientId = loadClientId()
    if (!clientId) return
    ensureToken(clientId)
      .then(driveBackupTime)
      .then(setDriveTime)
      .catch(() => {})
  }, [loc.section, gmailStatus])

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
          <p className="text-[13px] font-medium text-rose-600">Failed to load the field index.</p>
          <p className="mt-1 text-[12px] text-slate-500">{indexError}</p>
        </div>
      </div>
    )
  }

  if (!index || !facets) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-[13px] text-slate-500">
        Loading the database index…
      </div>
    )
  }

  const contactCount = Object.keys(outreach.state.records).length
  const showSidebar = loc.section === 'explore'
  const cycle = index.meta.cycle

  const content = (() => {
    if (loc.section === 'settings') {
      return (
        <SettingsView
          index={index}
          gmail={{
            status: gmailStatus,
            email: gmailEmail,
            lastSync: outreach.state.lastSync,
            syncing,
            syncStatus,
            error: gmailError,
            onConnect: handleConnect,
            onDisconnect: handleDisconnect,
            onSync: runSync,
          }}
          drive={{
            driveSync,
            onSetDriveSync: (on) => {
              setDriveSync(on)
              saveSyncEnabled(on)
              if (on) void doDriveBackup()
            },
            onBackupNow: () => void doDriveBackup(),
            onRestoreFromDrive: () => void doDriveRestore(),
            driveStatus,
            driveTime,
          }}
          requests={advisorRequests}
          onRequestField={() => setShowRequest(true)}
        />
      )
    }
    if (loc.section === 'saved') {
      return loc.view === 'advisors' ? (
        <SavedAdvisors
          loading={poolIncomplete}
          starCount={savedAdvisorCount}
          programs={fullPool}
          addedFaculty={overrides.addedFaculty}
          levels={starLevels}
          onSetLevel={setStarLevel}
          onOpenProgram={openProgram}
          notes={advisorNotes}
          onSetNote={setAdvisorNote}
          outreach={outreach.state.records}
          homepages={overrides.facultyHomepage}
          onSetHomepage={setFacultyHomepage}
        />
      ) : (
        <SavedPrograms
          loading={poolIncomplete}
          programs={savedProgramList}
          cycle={cycle}
          tiers={tiers}
          onSetTier={setTier}
          onToggleSaved={toggleSaved}
          onOpenProgram={openProgram}
          homepages={overrides.facultyHomepage}
          programPages={overrides.programPage}
          addedFaculty={overrides.addedFaculty}
          levels={starLevels}
          plan={plan.byProgramId}
          onAddToPlan={addToPlan}
        />
      )
    }
    if (loc.section === 'contact') {
      return loc.view === 'summary' ? (
        <OutreachOverview
          loading={poolIncomplete}
          pool={outreachPool}
          records={outreach.state.records}
          programSummaries={outreach.state.programSummaries}
          onOpenProgram={openProgram}
        />
      ) : (
        <OutreachView
          loading={poolIncomplete}
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
          onSync={runSync}
          syncing={syncing}
          syncStatus={syncStatus}
          onOpenSettings={() => go('settings')}
        />
      )
    }
    if (loc.view === 'advisors') {
      return (
        <AdvisorExplorer
          loading={poolIncomplete}
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
          addedFaculty={overrides.addedFaculty}
          onAddFaculty={addFaculty}
        />
      )
    }
    if (loc.view === 'schools') {
      return (
        <SchoolExplorer
          loading={poolIncomplete}
          programs={fullPool}
          cycle={cycle}
          query={schoolQuery}
          onQueryChange={setSchoolQuery}
          onOpenProgram={openProgram}
        />
      )
    }
    // Explore → Programs: filters | list | detail
    if (selectedPrimaries.size === 0) {
      return (
        <div className="flex min-w-0 flex-1 items-start justify-center overflow-y-auto bg-slate-50/40 px-6 py-16">
          <div className="w-full max-w-xl">
            <h2 className="font-serif text-xl font-bold text-slate-900">Pick a field to start</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
              The database holds {index.total.toLocaleString()} programs across {index.fields.length}{' '}
              fields and loads one field at a time so it stays fast. Type a field below, or tick one in
              the sidebar.
            </p>
            <div className="mt-4">
              <FieldSearch fields={index.fields} onPick={pickField} large />
            </div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {index.fields.slice(0, 12).map((f) => (
                <button
                  key={f.slug}
                  onClick={() => pickField(f.primary)}
                  className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-indigo-500 hover:text-indigo-700"
                >
                  {f.primary}
                  <span className="ml-1 text-[11px] tabular-nums text-slate-500">{f.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <ActiveFilters filters={filters} facets={facets} onChange={setFilters} />
        <div className="flex min-h-0 flex-1">
          <ProgramIndex
            programs={filtered}
            selectedId={selectedId}
            saved={savedPrograms}
            plan={plan.byProgramId}
            cycle={cycle}
            loading={selectedLoading}
            sortBy={sortBy}
            onSelect={setSelectedId}
            onToggleSaved={toggleSaved}
            onSortChange={setSortBy}
          />
          <DeepDive
            program={selected}
            cycle={cycle}
            loading={selectedLoading}
            saved={selected !== null && savedPrograms.has(selected.id)}
            onToggleSaved={() => selected && toggleSaved(selected.id)}
            plan={selected ? plan.byProgramId.get(selected.id) : undefined}
            onAddToPlan={() => (selected ? addToPlan(selected) : undefined)}
            programSummary={selected ? outreach.state.programSummaries[selected.id] : undefined}
            levels={starLevels}
            onSetLevel={setStarLevel}
            notes={advisorNotes}
            onSetNote={setAdvisorNote}
            outreach={outreach.state.records}
            homepages={overrides.facultyHomepage}
            onSetHomepage={setFacultyHomepage}
            programPage={
              selected ? (overrides.programPage[selected.id] ?? selected.links.program ?? '') : ''
            }
            onSetProgramPage={(u) => selected && setProgramPage(selected.id, u)}
            contactOverride={selected ? (overrides.programContact[selected.id] ?? '') : ''}
            onSetContact={(t) => selected && setProgramContact(selected.id, t)}
            addedFaculty={selected ? (overrides.addedFaculty[selected.id] ?? []) : []}
            onAddAdvisor={() => go('explore', 'advisors')}
            onRemoveFaculty={(id) => selected && removeFaculty(selected.id, id)}
            fieldOverrides={selected ? (overrides.programFields[selected.id] ?? {}) : {}}
            onSetField={(field, text) => selected && setProgramField(selected.id, field, text)}
            noteDoc={selected ? programDocs[selected.id] : undefined}
            googleClientId={loadClientId()}
            googleConnected={gmailStatus === 'connected'}
            onNoteCreated={linkProgramDoc}
            onNoteUnlink={unlinkProgramDoc}
          />
        </div>
      </div>
    )
  })()

  return (
    <div className="flex h-full flex-col bg-white text-slate-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900 px-4 py-2 text-white">
        <div className="flex shrink-0 items-baseline gap-3">
          <h1 className="font-serif text-[15px] font-bold tracking-tight">
            Grad Program &amp; Faculty Intelligence Tracker
          </h1>
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-indigo-300 ring-1 ring-inset ring-indigo-400/40">
            {cycle}
          </span>
        </div>

        <PrimaryNav loc={loc} contactCount={contactCount} onGo={(s) => go(s)} />

        <div className="flex items-center gap-3">
          <span className="text-[12px] tabular-nums text-slate-300" title={`data ${index.meta.generated_at}`}>
            {stillLoading ? (
              <span className="animate-pulse">loading…</span>
            ) : (
              `${index.total.toLocaleString()} programs`
            )}
          </span>
          <button
            onClick={() => go('settings')}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
              loc.section === 'settings'
                ? 'border-white bg-white text-slate-900'
                : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            title={gmailStatus === 'connected' ? `Google connected${gmailEmail ? ` as ${gmailEmail}` : ''}` : 'Settings: account, backup, AI'}
          >
            <span
              className={`inline-block size-1.5 rounded-full ${
                gmailStatus === 'connected' ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
              aria-hidden
            />
            Settings
          </button>
        </div>
      </header>

      <SubNav
        loc={loc}
        savedPrograms={savedPrograms.size}
        savedAdvisors={savedAdvisorCount}
        onGo={(v) => go(loc.section, v)}
      />

      {failedFields.size > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rose-200 bg-rose-50 px-4 py-1.5 text-[12px] text-rose-800">
          <span className="font-medium">
            Couldn’t load {failedFields.size === 1 ? 'one field' : `${failedFields.size} fields`}:
          </span>
          {[...failedFields.keys()].map((primary) => (
            <button
              key={primary}
              onClick={() => retryField(primary)}
              className="rounded border border-rose-300 bg-white px-1.5 py-0.5 font-medium transition-colors hover:bg-rose-100"
            >
              {primary} · retry
            </button>
          ))}
          <span className="text-rose-600">Everything else still works.</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {showSidebar && (
          <FilterSidebar
            facets={facets}
            filters={filters}
            onChange={setFilters}
            matchCount={loc.view === 'programs' ? filtered.length : fullPool.length}
            loading={loc.view === 'programs' ? selectedLoading : poolIncomplete}
            fields={index.fields}
            loadingFields={loadingFields}
            onPickField={pickField}
            shownFields={sidebarFields.shown}
            onToggleShownField={sidebarFields.toggle}
            onSetShownFields={sidebarFields.setAll}
            onClearShownFields={sidebarFields.clear}
            showDiscipline={loc.view === 'programs'}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          />
        )}
        {content}
      </div>

      {showRequest && <RequestFieldModal onClose={() => setShowRequest(false)} />}
    </div>
  )
}

export default App
