import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useHashRoute } from './lib/hashRoute'
import { startDriveAutoSync } from './lib/driveSync'

// The planner and the Europe page are separate applications that share this
// bundle. They are loaded lazily so the tracker — which most visits only ever
// use — doesn't carry their weight. See lib/hashRoute for why the split is on
// the hash rather than a path.
const PlannerApp = lazy(() => import('./planner/PlannerApp'))
const EuropeApp = lazy(() => import('./europe/EuropeApp'))

function Loading({ what }: { what: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
      Loading {what}…
    </div>
  )
}

function Root() {
  const route = useHashRoute()
  if (route === '/planner' || route.startsWith('/planner/')) {
    return (
      <Suspense fallback={<Loading what="the planner" />}>
        <PlannerApp />
      </Suspense>
    )
  }
  // #/europe is the address already published; #/masters is what the page is
  // now actually about. Both resolve here, and neither ever breaks a bookmark.
  if (
    route === '/europe' ||
    route.startsWith('/europe/') ||
    route === '/masters' ||
    route.startsWith('/masters/')
  ) {
    return (
      <Suspense fallback={<Loading what="master's programmes" />}>
        <EuropeApp />
      </Suspense>
    )
  }
  return <App />
}

// Back up to Drive from every route — the planner and the master's plan write
// their own storage keys, and neither mounts the tracker's App.
startDriveAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
