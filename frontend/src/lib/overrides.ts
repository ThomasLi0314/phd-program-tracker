import { useCallback, useState } from 'react'
import type { Faculty } from '../types'

const STORAGE_KEY = 'tracker.overrides.v1'

/** User-supplied fixes, layered over the shared dataset (which stays read-only).
 *  facultyHomepage keyed by `${programId}/${facultyId}` (advisorKey); programPage
 *  and programContact keyed by programId; addedFaculty maps programId → advisors
 *  the user added. Empty string clears a scalar override. */
export interface Overrides {
  facultyHomepage: Record<string, string>
  programPage: Record<string, string>
  programContact: Record<string, string>
  addedFaculty: Record<string, Faculty[]>
}

const EMPTY: Overrides = {
  facultyHomepage: {},
  programPage: {},
  programContact: {},
  addedFaculty: {},
}

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw)
    return {
      facultyHomepage: p.facultyHomepage ?? {},
      programPage: p.programPage ?? {},
      programContact: p.programContact ?? {},
      addedFaculty: p.addedFaculty ?? {},
    }
  } catch {
    return EMPTY
  }
}

export function useOverrides(): {
  overrides: Overrides
  setFacultyHomepage: (key: string, url: string) => void
  setProgramPage: (programId: string, url: string) => void
  setProgramContact: (programId: string, text: string) => void
  addFaculty: (programId: string, faculty: Faculty) => void
  removeFaculty: (programId: string, facultyId: string) => void
} {
  const [overrides, setState] = useState<Overrides>(load)

  const setMap = useCallback(
    (which: 'facultyHomepage' | 'programPage' | 'programContact', k: string, url: string) => {
      setState((prev) => {
        const map = { ...prev[which] }
        const u = url.trim()
        if (u) map[k] = u
        else delete map[k]
        const next = { ...prev, [which]: map }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [],
  )

  const setFacultyHomepage = useCallback(
    (key: string, url: string) => setMap('facultyHomepage', key, url),
    [setMap],
  )
  const setProgramPage = useCallback(
    (programId: string, url: string) => setMap('programPage', programId, url),
    [setMap],
  )
  const setProgramContact = useCallback(
    (programId: string, text: string) => setMap('programContact', programId, text),
    [setMap],
  )

  const addFaculty = useCallback(
    (programId: string, faculty: Faculty) => {
      setState((prev) => {
        const list = prev.addedFaculty[programId] ?? []
        if (list.some((f) => f.id === faculty.id)) return prev
        const next = {
          ...prev,
          addedFaculty: { ...prev.addedFaculty, [programId]: [...list, faculty] },
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [],
  )

  const removeFaculty = useCallback(
    (programId: string, facultyId: string) => {
      setState((prev) => {
        const list = prev.addedFaculty[programId] ?? []
        const nextList = list.filter((f) => f.id !== facultyId)
        const addedFaculty = { ...prev.addedFaculty }
        if (nextList.length) addedFaculty[programId] = nextList
        else delete addedFaculty[programId]
        const next = { ...prev, addedFaculty }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [],
  )

  return {
    overrides,
    setFacultyHomepage,
    setProgramPage,
    setProgramContact,
    addFaculty,
    removeFaculty,
  }
}
