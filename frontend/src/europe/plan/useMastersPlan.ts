// The master's plan's single source of truth. Every mutation funnels through
// `update`, and writes are debounced into storage.ts — the same shape as the
// PhD planner's usePlanner, minus everything to do with faculty.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EuroProgram } from '../types'
import type { MastersPlanEntry, MastersPlanState, MineValues } from './types'
import { EMPTY_MINE } from './types'
import { defaultChecklist, loadPlan, MASTERS_PLAN_KEY, newId, savePlan } from './storage'

const SAVE_DEBOUNCE_MS = 400

export type SaveStatus = 'idle' | 'saving' | 'saved'

export interface CustomInput {
  university: string
  programName: string
  country: string
  city?: string
  website?: string
}

export interface MastersPlanApi {
  state: MastersPlanState
  saveStatus: SaveStatus
  /** Entry id of a dataset programme already in the plan, if any. */
  entryFor: (programId: string) => MastersPlanEntry | undefined
  addFromDatabase: (p: EuroProgram) => string
  addCustom: (input: CustomInput) => string
  update: (id: string, patch: Partial<MastersPlanEntry>) => void
  setMine: (id: string, key: keyof MineValues, value: string | null) => void
  toggleItem: (id: string, itemId: string) => void
  addItem: (id: string, label: string) => void
  removeItem: (id: string, itemId: string) => void
  remove: (id: string) => void
  setCycle: (cycle: string) => void
}

function baseEntry(cycle: string): Omit<MastersPlanEntry, 'id' | 'ref' | 'university' | 'programName' | 'city' | 'country' | 'links'> {
  const now = new Date().toISOString()
  return {
    intake: cycle,
    interest: 'interested',
    status: 'considering',
    scholarship: 'undecided',
    mine: { ...EMPTY_MINE },
    checklist: defaultChecklist(),
    submittedOn: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function useMastersPlan(): MastersPlanApi {
  const [state, setState] = useState<MastersPlanState>(loadPlan)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  /** Stops the first render from writing back what it just read. */
  const dirty = useRef(false)

  // Another tab may edit the plan. `storage` fires only in OTHER tabs, so this
  // never echoes our own save back into state.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== MASTERS_PLAN_KEY) return
      dirty.current = false
      setState(loadPlan())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 'saving' is set by `mutate`, in the same batch as the edit, rather than
  // here: a setState inside this effect would add a second render to every
  // keystroke in a notes box.
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      savePlan(state)
      setSaveStatus('saved')
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state])

  const mutate = useCallback((fn: (s: MastersPlanState) => MastersPlanState) => {
    dirty.current = true
    setState(fn)
    setSaveStatus('saving')
  }, [])

  const patchEntry = useCallback(
    (id: string, fn: (e: MastersPlanEntry) => MastersPlanEntry) =>
      mutate((s) => ({
        ...s,
        programs: s.programs.map((e) => (e.id === id ? { ...fn(e), updatedAt: new Date().toISOString() } : e)),
      })),
    [mutate],
  )

  const entryFor = useCallback(
    (programId: string) =>
      state.programs.find((e) => e.ref.kind === 'database' && e.ref.programId === programId),
    [state.programs],
  )

  const addFromDatabase = useCallback(
    (p: EuroProgram): string => {
      // Adding the same programme twice is never what anyone means.
      const existing = entryFor(p.id)
      if (existing) return existing.id
      const entry: MastersPlanEntry = {
        id: newId('mp'),
        ref: { kind: 'database', programId: p.id },
        university: p.university,
        programName: p.program_name,
        city: p.city,
        country: p.country,
        links: { program: p.links.program, portal: '' },
        ...baseEntry(state.settings.cycle),
      }
      mutate((s) => ({ ...s, programs: [...s.programs, entry] }))
      return entry.id
    },
    [entryFor, mutate, state.settings.cycle],
  )

  const addCustom = useCallback(
    (input: CustomInput): string => {
      const entry: MastersPlanEntry = {
        id: newId('mp'),
        ref: { kind: 'custom' },
        university: input.university.trim(),
        programName: input.programName.trim(),
        city: (input.city ?? '').trim(),
        country: input.country.trim(),
        links: { program: (input.website ?? '').trim(), portal: '' },
        ...baseEntry(state.settings.cycle),
      }
      mutate((s) => ({ ...s, programs: [...s.programs, entry] }))
      return entry.id
    },
    [mutate, state.settings.cycle],
  )

  const update = useCallback(
    (id: string, patch: Partial<MastersPlanEntry>) => patchEntry(id, (e) => ({ ...e, ...patch })),
    [patchEntry],
  )

  const setMine = useCallback(
    (id: string, key: keyof MineValues, value: string | null) =>
      patchEntry(id, (e) => ({ ...e, mine: { ...e.mine, [key]: value && value.trim() ? value.trim() : null } })),
    [patchEntry],
  )

  const toggleItem = useCallback(
    (id: string, itemId: string) =>
      patchEntry(id, (e) => ({
        ...e,
        checklist: e.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
      })),
    [patchEntry],
  )

  const addItem = useCallback(
    (id: string, label: string) => {
      const text = label.trim()
      if (!text) return
      patchEntry(id, (e) => ({ ...e, checklist: [...e.checklist, { id: newId('chk'), label: text, done: false }] }))
    },
    [patchEntry],
  )

  const removeItem = useCallback(
    (id: string, itemId: string) =>
      patchEntry(id, (e) => ({ ...e, checklist: e.checklist.filter((c) => c.id !== itemId) })),
    [patchEntry],
  )

  const remove = useCallback(
    (id: string) => mutate((s) => ({ ...s, programs: s.programs.filter((e) => e.id !== id) })),
    [mutate],
  )

  const setCycle = useCallback(
    (cycle: string) => mutate((s) => ({ ...s, settings: { ...s.settings, cycle } })),
    [mutate],
  )

  return {
    state,
    saveStatus,
    entryFor,
    addFromDatabase,
    addCustom,
    update,
    setMine,
    toggleItem,
    addItem,
    removeItem,
    remove,
    setCycle,
  }
}
