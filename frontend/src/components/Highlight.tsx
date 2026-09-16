import { Fragment } from 'react'

/** Search terms from a free-text query: lower-cased, blanks dropped. */
export function termsOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Text with the search terms marked. Plain text when there are no terms, so
 * every card can use it unconditionally.
 */
export function Highlight({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || terms.length === 0 || !text) return <>{text}</>
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-yellow-200/80 px-0 text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
