import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.myList.v1'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Personal program shortlist, persisted in localStorage. */
export function useMyList(): { myList: Set<string>; toggle: (id: string) => void } {
  const [myList, setMyList] = useState<Set<string>>(load)

  const toggle = useCallback((id: string) => {
    setMyList((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // storage full/blocked — keep in-memory state
      }
      return next
    })
  }, [])

  return { myList, toggle }
}
