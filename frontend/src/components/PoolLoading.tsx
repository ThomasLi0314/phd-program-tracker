// Shown by the whole-database views (Advisors, Schools, Starred, Outreach,
// Overview) while the 20 per-field chunks stream in. Without it those views
// render their EMPTY state during the load — telling the user they've starred
// nobody, or that no advisor matches, when the data simply hasn't arrived.
export function PoolLoading({ what }: { what: string }) {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="animate-pulse text-sm font-medium text-slate-400">Loading {what}…</p>
      <p className="mt-1 text-[12px] text-slate-400">
        This view searches every field, so the whole database is loading.
      </p>
    </div>
  )
}
