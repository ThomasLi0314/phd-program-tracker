// The planner's single source of truth. Every mutation goes through here, and
// every write goes through PlannerStorage — no component touches localStorage
// (spec §30). Ordinary edits autosave (spec §37).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Faculty, Program } from '../../types'
import type {
  LetterStatus,
  PlannerCategory,
  PlannerFaculty,
  PlannerProgram,
  PlannerSettings,
  PlannerState,
  Recommender,
} from '../types'
import { lettersOf } from './letters'
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
  /**
   * Take an advisor off one program's list. Someone still listed under another
   * program stays in the plan for it; someone listed nowhere else is removed
   * from the plan entirely, rather than lingering on the Faculty page with no
   * program.
   */
  dropFacultyFromProgram: (programEntryId: string, facultyEntryId: string) => void
  /** Undo dropFacultyFromProgram: put the entry back, at its old place in the list. */
  restoreFacultyToProgram: (faculty: PlannerFaculty, programEntryId: string, index: number) => void

  setResearchProfile: (text: string) => void
  updateSettings: (patch: Partial<PlannerSettings>) => void

  /** Categories are the user's own: created, renamed and assigned by hand. */
  addCategory: (name: string) => string | null
  renameCategory: (id: string, name: string) => void
  removeCategory: (id: string) => void
  setProgramCategory: (programEntryId: string, categoryId: string | null) => void

  /** Letter writers: entered once, then attached to programs one by one. */
  addRecommender: (input: Partial<Omit<Recommender, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }) => string
  updateRecommender: (id: string, patch: Partial<Omit<Recommender, 'id' | 'createdAt'>>) => void
  /** Deletes the person and their letters from every program. */
  removeRecommender: (id: string) => void
  /** Ask this person for a letter for these programs (ones already listing them are left alone). */
  assignLetters: (recommenderId: string, programEntryIds: string[]) => void
  setLetterStatus: (programEntryId: string, recommenderId: string, status: LetterStatus) => void
  unassignLetter: (programEntryId: string, recommenderId: string) => void

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

  const dropFacultyFromProgram = useCallback(
    (programEntryId: string, facultyEntryId: string) =>
      update((s) => {
        const elsewhere = s.programs.some((p) => p.id !== programEntryId && p.facultyIds.includes(facultyEntryId))
        return {
          ...s,
          programs: s.programs.map((p) =>
            p.id === programEntryId ? { ...p, facultyIds: p.facultyIds.filter((x) => x !== facultyEntryId) } : p,
          ),
          faculty: elsewhere
            ? s.faculty.map((f) =>
                f.id === facultyEntryId ? { ...f, programIds: f.programIds.filter((x) => x !== programEntryId) } : f,
              )
            : s.faculty.filter((f) => f.id !== facultyEntryId),
        }
      }),
    [update],
  )

  const restoreFacultyToProgram = useCallback(
    (faculty: PlannerFaculty, programEntryId: string, index: number) =>
      update((s) => {
        const present = s.faculty.some((f) => f.id === faculty.id)
        return {
          ...s,
          faculty: present
            ? s.faculty.map((f) =>
                f.id === faculty.id && !f.programIds.includes(programEntryId)
                  ? { ...f, programIds: [...f.programIds, programEntryId] }
                  : f,
              )
            : [
                ...s.faculty,
                faculty.programIds.includes(programEntryId)
                  ? faculty
                  : { ...faculty, programIds: [...faculty.programIds, programEntryId] },
              ],
          programs: s.programs.map((p) => {
            if (p.id !== programEntryId || p.facultyIds.includes(faculty.id)) return p
            const ids = [...p.facultyIds]
            ids.splice(Math.min(Math.max(index, 0), ids.length), 0, faculty.id)
            return { ...p, facultyIds: ids }
          }),
        }
      }),
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

  const addRecommender = useCallback(
    (input: Partial<Omit<Recommender, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }): string => {
      const now = new Date().toISOString()
      const r: Recommender = {
        id: newId('rec'),
        name: input.name.trim(),
        title: input.title?.trim() ?? '',
        institution: input.institution?.trim() ?? '',
        email: input.email?.trim() ?? '',
        relationship: input.relationship?.trim() ?? '',
        notes: input.notes ?? '',
        createdAt: now,
        updatedAt: now,
      }
      update((s) => ({ ...s, recommenders: [...s.recommenders, r] }))
      return r.id
    },
    [update],
  )

  const updateRecommender = useCallback(
    (id: string, patch: Partial<Omit<Recommender, 'id' | 'createdAt'>>) =>
      update((s) => ({
        ...s,
        recommenders: s.recommenders.map((r) => (r.id === id ? touch({ ...r, ...patch }) : r)),
      })),
    [update],
  )

  const removeRecommender = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        recommenders: s.recommenders.filter((r) => r.id !== id),
        programs: s.programs.map((p) =>
          lettersOf(p).some((l) => l.recommenderId === id)
            ? { ...p, letters: lettersOf(p).filter((l) => l.recommenderId !== id) }
            : p,
        ),
      })),
    [update],
  )

  const assignLetters = useCallback(
    (recommenderId: string, programEntryIds: string[]) => {
      const now = new Date().toISOString()
      const targets = new Set(programEntryIds)
      update((s) => ({
        ...s,
        programs: s.programs.map((p) =>
          targets.has(p.id) && !lettersOf(p).some((l) => l.recommenderId === recommenderId)
            ? {
                ...p,
                letters: [...lettersOf(p), { recommenderId, status: 'not_requested' as const, updatedAt: now }],
              }
            : p,
        ),
      }))
    },
    [update],
  )

  const setLetterStatus = useCallback(
    (programEntryId: string, recommenderId: string, status: LetterStatus) =>
      update((s) => ({
        ...s,
        programs: s.programs.map((p) =>
          p.id === programEntryId
            ? {
                ...p,
                letters: lettersOf(p).map((l) =>
                  l.recommenderId === recommenderId && l.status !== status
                    ? { ...l, status, updatedAt: new Date().toISOString() }
                    : l,
                ),
              }
            : p,
        ),
      })),
    [update],
  )

  const unassignLetter = useCallback(
    (programEntryId: string, recommenderId: string) =>
      update((s) => ({
        ...s,
        programs: s.programs.map((p) =>
          p.id === programEntryId
            ? { ...p, letters: lettersOf(p).filter((l) => l.recommenderId !== recommenderId) }
            : p,
        ),
      })),
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
        const haveRec = new Set(s.recommenders.map((r) => r.id))
        return {
          ...s,
          programs: [...s.programs, ...incoming.programs.filter((p) => !haveProgs.has(progKey(p)))],
          faculty: [...s.faculty, ...incoming.faculty.filter((f) => !haveFac.has(facKey(f)))],
          recommenders: [...s.recommenders, ...incoming.recommenders.filter((r) => !haveRec.has(r.id))],
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
    dropFacultyFromProgram,
    restoreFacultyToProgram,
    setResearchProfile,
    updateSettings,
    addCategory,
    renameCategory,
    removeCategory,
    setProgramCategory,
    addRecommender,
    updateRecommender,
    removeRecommender,
    assignLetters,
    setLetterStatus,
    unassignLetter,
    replaceAll,
    mergeIn,
  }
}
