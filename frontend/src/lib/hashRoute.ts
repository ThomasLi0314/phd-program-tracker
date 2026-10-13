import { useEffect, useState } from 'react'

// Hash routing, deliberately.
//
// Two facts about this deployment make path-based routes the wrong tool:
//
//  1. GitHub Pages serves docs/ statically with NO SPA fallback — there is no
//     404.html — so a hard refresh on /phd-program-tracker/planner/ would 404
//     at the server before any JS ran.
//  2. vite.config.ts sets `base: './'`, so `import.meta.env.BASE_URL` is './'
//     and every fetch in lib/dataLoader.ts resolves against the DOCUMENT url.
//     Served one directory deeper, `./data/index.json` would resolve to
//     /phd-program-tracker/planner/data/index.json — which does not exist.
//
// A hash keeps the document url fixed, so both problems disappear and the same
// build keeps working on Pages, behind the Cloudflare tunnel and in dev. That
// is also why this is 40 lines instead of a router dependency.

/** Current route path, without the '#'. Always starts with '/'. */
export function currentRoute(): string {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

/** Re-renders on every hash change (including Back/Forward). */
export function useHashRoute(): string {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    // The hash may already have changed between first render and this effect.
    onChange()
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

// Where I came from, so a back arrow can return there.
//
// Every detail page used to send its back arrow to one fixed list, so opening a
// professor from a program's page and pressing back landed on the Faculty list
// — not the program I was reading. The browser's own history would be exact,
// but history.back() can walk out of the site entirely when the page was opened
// cold on a detail route, so keep our own trail of the routes this session
// actually visited.
const trail: string[] = []

// ── Where I was on the page, not just which page ─────────────────────────────
//
// Going back landed at the top of the list every time, so returning to a
// program forty rows down meant scrolling forty rows again. Each route's scroll
// position is remembered as I leave it and put back when I return.
//
// These views don't scroll the window: each one is an `overflow-y-auto` <main>
// (or the tracker's <nav> column), so the positions are taken from the scroll
// containers themselves, in document order — stable for a given route, and no
// component has to opt in. Mark any other scroller with `data-scroll` to
// include it.
interface ScrollSnapshot {
  window: number
  containers: number[]
}
const scrollMemory = new Map<string, ScrollSnapshot>()

function scrollContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('main, nav, [data-scroll]'))
}

function rememberScroll(route: string): void {
  scrollMemory.set(route, {
    window: window.scrollY,
    containers: scrollContainers().map((el) => el.scrollTop),
  })
}

/**
 * Put a remembered position back. The content often isn't there yet — the
 * planner's tables and the tracker's field chunks render after the route
 * changes — so this retries briefly until the page is tall enough to hold the
 * position, then stops.
 */
function restoreScroll(route: string): void {
  const snap = scrollMemory.get(route)
  if (!snap) return
  let tries = 0
  const apply = () => {
    const els = scrollContainers()
    let short = false
    snap.containers.forEach((top, i) => {
      if (!top) return
      const el = els[i]
      if (!el) {
        short = true
        return
      }
      el.scrollTop = top
      if (Math.abs(el.scrollTop - top) > 2) short = true
    })
    if (snap.window) window.scrollTo(0, snap.window)
    if (short && tries++ < 12) setTimeout(apply, 50)
  }
  requestAnimationFrame(apply)
}

/** Navigate; pushes a history entry so Back works. */
export function navigate(path: string): void {
  const to = path.startsWith('/') ? path : `/${path}`
  const from = currentRoute()
  if (from === to) return
  rememberScroll(from)
  trail.push(from)
  window.location.hash = to
}

/**
 * Back to wherever I opened this page from, or `fallback` when it was opened
 * cold (a bookmark, a refresh, a pasted link).
 */
export function goBack(fallback: string): void {
  const prev = trail.pop()
  rememberScroll(currentRoute())
  window.location.hash = prev ?? (fallback.startsWith('/') ? fallback : `/${fallback}`)
}

/** The route the back arrow would return to, for labelling it. */
export function backTarget(): string | null {
  return trail.length ? trail[trail.length - 1] : null
}

// The browser's own Back button moves the hash without going through
// navigate(); drop the trail entry it just consumed so our arrow doesn't send
// the user forward again.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (trail.length && trail[trail.length - 1] === currentRoute()) trail.pop()
    // Covers the browser's own Back button too, not just our arrow.
    restoreScroll(currentRoute())
  })

  // Keep the current route's position up to date as I scroll, so leaving by any
  // route — our arrow, a link, the browser's Back — finds it already recorded.
  // Capture phase: these scrolls happen inside containers, and scroll events
  // from an element don't bubble.
  let pending = 0
  window.addEventListener(
    'scroll',
    () => {
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        rememberScroll(currentRoute())
      })
    },
    true,
  )
}

/** Split a route into its non-empty segments: '/planner/programs/x' → [planner, programs, x]. */
export function segments(route: string): string[] {
  return route.split('/').filter(Boolean)
}
