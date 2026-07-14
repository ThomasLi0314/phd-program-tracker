import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.overrides.v1'

/** User-supplied link fixes, layered over the shared dataset (which stays
 *  read-only). facultyHomepage keyed by `${programId}/${facultyId}` (advisorKey);
 *  programPage keyed by programId. Empty string clears an override. */
export interface Overrides {
  facultyHomepage: Record<string, string>
  programPage: Record<string, string>
}

const EMPTY: Overrides = { facultyHomepage: {}, programPage: {} }

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw)
    return { facultyHomepage: p.facultyHomepage ?? {}, programPage: p.programPage ?? {} }
  } catch {
    return EMPTY
  }
}

export function useOverrides(): {
  overrides: Overrides
  setFacultyHomepage: (key: string, url: string) => void
  setProgramPage: (programId: string, url: string) => void
} {
  const [overrides, setState] = useState<Overrides>(load)

  const setMap = useCallback(
    (which: 'facultyHomepage' | 'programPage', k: string, url: string) => {
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

  return { overrides, setFacultyHomepage, setProgramPage }
}
