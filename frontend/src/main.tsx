import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useHashRoute } from './lib/hashRoute'

// The planner is a separate application that shares this bundle. It is loaded
// lazily so the tracker — which most visits only ever use — doesn't carry its
// weight. See lib/hashRoute for why the split is on the hash rather than a path.
const PlannerApp = lazy(() => import('./planner/PlannerApp'))

function Root() {
  const route = useHashRoute()
  if (route === '/planner' || route.startsWith('/planner/')) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
            Loading the planner…
          </div>
        }
      >
        <PlannerApp />
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
