// Small view preferences — a collapsed sidebar, card vs list density, which
// filter groups are open. These are conveniences, not user data: they are
// deliberately NOT part of backup.ts, for the same reason sidebarFields isn't
// (a preference key would make isLocalEmpty() false and suppress the Drive
// restore offer on a fresh browser).

import { useCallback, useState } from 'react'

const PREFIX = 'tracker.prefs.'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage blocked — keep the in-memory value */
  }
}

/** useState that survives a reload. */
export function usePref<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback))
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        write(key, v)
        return v
      }),
    [key],
  )
  return [value, set]
}
