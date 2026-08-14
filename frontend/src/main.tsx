import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useHashRoute } from './lib/hashRoute'

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
  if (route === '/europe' || route.startsWith('/europe/')) {
    return (
      <Suspense fallback={<Loading what="European programmes" />}>
        <EuropeApp />
      </Suspense>
    )
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
