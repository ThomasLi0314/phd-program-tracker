import { MAX_PRIORITY } from '../lib/starredAdvisors'

/** Clickable N-slot priority rating. Click slot n to set priority n;
 *  click the current top star again to clear (level 0). */
export function StarRating({
  level,
  onSetLevel,
  max = MAX_PRIORITY,
  size = 'sm',
}: {
  level: number
  onSetLevel: (n: number) => void
  max?: number
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={`Priority ${level} of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1
        const filled = n <= level
        return (
          <button
            key={n}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSetLevel(n === level ? 0 : n)
            }}
            title={
              n === level
                ? `Priority ${n} — click to clear`
                : `Set priority ${n}${n === max ? ' (highest)' : ''}`
            }
            aria-label={`Set priority ${n}`}
            className={`leading-none transition-transform hover:scale-110 ${
              size === 'md' ? 'text-[16px]' : 'text-[13px]'
            } ${filled ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}
          >
            {filled ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}
