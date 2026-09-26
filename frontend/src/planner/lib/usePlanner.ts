// The planner's single source of truth. Every mutation goes through here, and
// every write goes through PlannerStorage — no component touches localStorage
// (spec §30). Ordinary edits autosave (spec §37).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Faculty, Program } from '../../types'
import type {
  PlannerCategory,
  PlannerFaculty,
  PlannerProgram,
  PlannerSettings,
  PlannerState,
} from '../types'
import { localPlannerStorage, newId, PLANNER_KEY, type PlannerStorage } from './storage'
import {
  customFaculty,
  customProgram,
  facultyFromReference,
  programFromReference,
} from './referenceBridge'
import { mergeKey } from '../../lib/mergeAdvisors'

export type SaveStatus = 'idle' | 'saving' | 'saved'

const SAVE_DEBOUNCE_MS = 500

export interface PlannerApi {
  /** null while the first load is in flight. */
  state: PlannerState | null
  saveStatus: SaveStatus

  addProgramFromReference: (p: Program) => string | null
  addCustomProgram: (input: { university: string; programName: string; website?: string }) => string
  updateProgram: (id: string, patch: Partial<PlannerProgram>) => void
  removeProgram: (id: string) => void

  addFacultyFromReference: (f: Faculty, p: Program, programEntryId?: string) => string | null
  addCustomFaculty: (
    input: { name: string; university?: string; department?: string; homepage?: string },
    programEntryId?: string,
  ) => string
  updateFaculty: (id: string, patch: Partial<PlannerFaculty>) => void
  removeFaculty: (id: string) => void

  linkFaculty: (programEntryId: string, facultyEntryId: string) => void
  unlinkFaculty: (programEntryId: string, facultyEntryId: string) => void

  setResearchProfile: (text: string) => void
  updateSettings: (patch: Partial<PlannerSettings>) => void

  /** Categories are the user's own: created, renamed and assigned by hand. */
  addCategory: (name: string) => string | null
  renameCategory: (id: string, name: string) => void
  removeCategory: (id: string) => void
  setProgramCategory: (programEntryId: string, categoryId: string | null) => void

  /** Import (spec §31). Replace swaps everything; merge keeps what I already have. */
  replaceAll: (next: PlannerState) => void
  mergeIn: (incoming: PlannerState) => void
}

export function usePlanner(storage: PlannerStorage = localPlannerStorage): PlannerApi {
  const [state, setState] = useState<PlannerState | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  /** Guards the initial load from immediately writing back what it just read. */
  const dirty = useRef(false)

  useEffect(() => {
    let alive = true
    void storage.loadPlanner().then((s) => {
      if (alive) setState(s)
    })
    return () => {
      alive = false
    }
  }, [storage])

  // Another tab (the tracker's "Add to plan", or a second planner window) may
  // write the store. `storage` fires only in OTHER tabs, so re-reading here
  // never echoes our own save; the dirty flag stays false so nothing is
  // written back.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== PLANNER_KEY) return
      void storage.loadPlanner().then((s) => {
        dirty.current = false
        setState(s)
      })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  useEffect(() => {
    if (!state || !dirty.current) return
    setSaveStatus('saving')
    const t = setTimeout(() => {
      void storage.savePlanner(state).then(() => setSaveStatus('saved'))
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state, storage])

  /** Every mutation funnels through here so nothing can forget to mark dirty. */
  const update = useCallback((fn: (s: PlannerState) => PlannerState) => {
    dirty.current = true
    setState((prev) => (prev ? fn(prev) : prev))
  }, [])

  const touch = <T extends { updatedAt: string }>(x: T): T => ({
    ...x,
    updatedAt: new Date().toISOString(),
  })

  const addProgramFromReference = useCallback(
    (p: Program): string | null => {
      // Adding the same dataset program twice is always a mistake, not an intent.
      const existing = state?.programs.find(
        (x) => x.ref.kind === 'database' && x.ref.programId === p.id,
      )
      if (existing) return null
      const entry = programFromReference(p, state?.settings.cycle ?? 'Fall 2027')
      update((s) => ({ ...s, programs: [...s.programs, entry] }))
      return entry.id
    },
    [state, update],
  )

  const addCustomProgram = useCallback(
    (input: { university: string; programName: string; website?: string }): string => {
      const entry = customProgram(input, state?.settings.cycle ?? 'Fall 2027')
      update((s) => ({ ...s, programs: [...s.programs, entry] }))
      return entry.id
    },
    [state, update],
  )

  const updateProgram = useCallback(
    (id: string, patch: Partial<PlannerProgram>) =>
      update((s) => ({
        ...s,
        programs: s.programs.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)),
      })),
    [update],
  )

  const removeProgram = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        programs: s.programs.filter((p) => p.id !== id),
        // Keep the faculty — a person can matter across programs — but drop the
        // dangling back-reference so the many-to-many graph stays consistent.
        faculty: s.faculty.map((f) =>
          f.programIds.includes(id) ? { ...f, programIds: f.programIds.filter((x) => x !== id) } : f,
        ),
      })),
    [update],
  )

  const linkBoth = (s: PlannerState, programEntryId: string, facultyEntryId: string): PlannerState => ({
    ...s,
    programs: s.programs.map((p) =>
      p.id === programEntryId && !p.facultyIds.includes(facultyEntryId)
        ? { ...p, facultyIds: [...p.facultyIds, facultyEntryId] }
        : p,
    ),
    faculty: s.faculty.map((f) =>
      f.id === facultyEntryId && !f.programIds.includes(programEntryId)
        ? { ...f, programIds: [...f.programIds, programEntryId] }
        : f,
    ),
  })

  const addFacultyFromReference = useCallback(
    (f: Faculty, p: Program, programEntryId?: string): string | null => {
      const key = mergeKey(f.name, p.university)
      const existing = state?.faculty.find((x) => x.ref.kind === 'database' && x.ref.mergeKey === key)
      if (existing) {
        // Already tracked: don't duplicate the person, just widen where they
        // advise (spec §7 — one record, many programs).
        if (programEntryId) update((s) => linkBoth(s, programEntryId, existing.id))
        return null
      }
      const entry = facultyFromReference(f, p)
      update((s) => {
        const withFaculty = { ...s, faculty: [...s.faculty, entry] }
        return programEntryId ? linkBoth(withFaculty, programEntryId, entry.id) : withFaculty
      })
      return entry.id
    },
    [state, update],
  )

  const addCustomFaculty = useCallback(
    (
      input: { name: string; university?: string; department?: string; homepage?: string },
      programEntryId?: string,
    ): string => {
      const entry = customFaculty(input)
      update((s) => {
        const withFaculty = { ...s, faculty: [...s.faculty, entry] }
        return programEntryId ? linkBoth(withFaculty, programEntryId, entry.id) : withFaculty
      })
      return entry.id
    },
    [update],
  )

  const updateFaculty = useCallback(
    (id: string, patch: Partial<PlannerFaculty>) =>
      update((s) => ({
        ...s,
        faculty: s.faculty.map((f) => (f.id === id ? touch({ ...f, ...patch }) : f)),
      })),
    [update],
  )

  const removeFaculty = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        faculty: s.faculty.filter((f) => f.id !== id),
        programs: s.programs.map((p) =>
          p.facultyIds.includes(id) ? { ...p, facultyIds: p.facultyIds.filter((x) => x !== id) } : p,
        ),
      })),
    [update],
  )

  const linkFaculty = useCallback(
    (programEntryId: string, facultyEntryId: string) =>
      update((s) => linkBoth(s, programEntryId, facultyEntryId)),
    [update],
  )

  const unlinkFaculty = useCallback(
    (programEntryId: string, facultyEntryId: string) =>
      update((s) => ({
        ...s,
        programs: s.programs.map((p) =>
          p.id === programEntryId ? { ...p, facultyIds: p.facultyIds.filter((x) => x !== facultyEntryId) } : p,
        ),
        faculty: s.faculty.map((f) =>
          f.id === facultyEntryId ? { ...f, programIds: f.programIds.filter((x) => x !== programEntryId) } : f,
        ),
      })),
    [update],
  )

  const setResearchProfile = useCallback(
    (text: string) => update((s) => ({ ...s, researchProfile: text })),
    [update],
  )

  const addCategory = useCallback(
    (name: string): string | null => {
      const text = name.trim()
      if (!text) return null
      const category: PlannerCategory = { id: newId('cat'), name: text.slice(0, 60) }
      update((s) => ({ ...s, categories: [...s.categories, category] }))
      return category.id
    },
    [update],
  )

  const renameCategory = useCallback(
    (id: string, name: string) => {
      const text = name.trim()
      if (!text) return
      update((s) => ({
        ...s,
        categories: s.categories.map((c) => (c.id === id ? { ...c, name: text.slice(0, 60) } : c)),
      }))
    },
    [update],
  )

  /** Deleting a category never deletes programs — they fall back to no category. */
  const removeCategory = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        categories: s.categories.filter((c) => c.id !== id),
        programs: s.programs.map((p) => (p.categoryId === id ? { ...p, categoryId: null } : p)),
      })),
    [update],
  )

  const setProgramCategory = useCallback(
    (programEntryId: string, categoryId: string | null) =>
      update((s) => ({
        ...s,
        programs: s.programs.map((p) =>
          p.id === programEntryId ? touch({ ...p, categoryId }) : p,
        ),
      })),
    [update],
  )

  const updateSettings = useCallback(
    (patch: Partial<PlannerSettings>) =>
      update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [update],
  )

  const replaceAll = useCallback((next: PlannerState) => update(() => next), [update])

  const mergeIn = useCallback(
    (incoming: PlannerState) =>
      update((s) => {
        // Identity for merging: canonical ref where there is one, else the
        // planner id. Never fuse two custom entries just because they share a
        // name — the user gets duplicates they can resolve, not silent loss.
        const progKey = (p: PlannerProgram) =>
          p.ref.kind === 'database' ? `db:${p.ref.programId}` : `id:${p.id}`
        const facKey = (f: PlannerFaculty) =>
          f.ref.kind === 'database' ? `db:${f.ref.mergeKey}` : `id:${f.id}`

        const haveProgs = new Set(s.programs.map(progKey))
        const haveFac = new Set(s.faculty.map(facKey))
        return {
          ...s,
          programs: [...s.programs, ...incoming.programs.filter((p) => !haveProgs.has(progKey(p)))],
          faculty: [...s.faculty, ...incoming.faculty.filter((f) => !haveFac.has(facKey(f)))],
        }
      }),
    [update],
  )

  return {
    state,
    saveStatus,
    addProgramFromReference,
    addCustomProgram,
    updateProgram,
    removeProgram,
    addFacultyFromReference,
    addCustomFaculty,
    updateFaculty,
    removeFaculty,
    linkFaculty,
    unlinkFaculty,
    setResearchProfile,
    updateSettings,
    addCategory,
    renameCategory,
    removeCategory,
    setProgramCategory,
    replaceAll,
    mergeIn,
  }
}
