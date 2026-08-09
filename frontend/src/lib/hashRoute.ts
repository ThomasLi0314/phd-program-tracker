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

/** Navigate; pushes a history entry so Back works. */
export function navigate(path: string): void {
  window.location.hash = path.startsWith('/') ? path : `/${path}`
}

/** Split a route into its non-empty segments: '/planner/programs/x' → [planner, programs, x]. */
export function segments(route: string): string[] {
  return route.split('/').filter(Boolean)
}
