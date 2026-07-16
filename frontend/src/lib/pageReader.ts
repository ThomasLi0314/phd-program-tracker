// Fetch a real web page from the browser, as text.
//
// WHY A READER SERVICE: this app is a static site, and university pages send no
// `Access-Control-Allow-Origin`, so the browser refuses to read them directly —
// verified against ceoas.oregonstate.edu and colorado.edu, both of which return
// no CORS header at all. Jina's reader proxies the page and DOES send CORS
// (verified: `Access-Control-Allow-Origin: https://thomasli0314.github.io`), and
// its basic tier needs no API key. It also renders JS-heavy pages, which most
// university directories are.
//
// This matters for data integrity: DeepSeek cannot browse (its own system prompt
// says so), so anything it "knows" about a professor is training recall that may
// be stale or invented. Feeding it a page fetched HERE means the card is derived
// from a real source we can cite and re-check.

const READER = 'https://r.jina.ai/'

/** Characters of page text we keep. Enough for a faculty profile; caps the
 *  DeepSeek bill and stays well inside the context window. */
const MAX_CHARS = 24_000

export interface PageContent {
  url: string
  text: string
  fetchedAt: number
  truncated: boolean
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * Does this page plausibly concern `name`? A deterministic guard against the
 * wrong URL, checked BEFORE spending a DeepSeek call.
 *
 * It exists because a length check is not enough: a mistyped OSU URL returns a
 * "No Data" 404 page carrying ~7,000 characters of navigation chrome, which
 * sails past any size threshold. Asking the model to notice works most of the
 * time, but "most of the time" is how fabricated records get in.
 *
 * The test is the surname only — pages routinely differ on given names
 * ("J. Thomas Farrar" vs "Tom Farrar"), but if the surname appears nowhere in
 * the page, it is not about this person.
 */
export function mentionsName(pageText: string, name: string): boolean {
  const parts = fold(name)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1)
  if (parts.length === 0) return true // nothing checkable — don't block
  const surname = parts[parts.length - 1]
  return fold(pageText).includes(surname)
}

export function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

export function isProbablyUrl(raw: string): boolean {
  const s = normalizeUrl(raw)
  if (!s) return false
  try {
    const u = new URL(s)
    return !!u.hostname && u.hostname.includes('.')
  } catch {
    return false
  }
}

/**
 * Read a page as plain markdown text. Throws with a human-readable message —
 * callers surface it verbatim, since "couldn't read that page" is a fact the
 * user needs, not something to paper over with a guessed card.
 */
export async function readPage(rawUrl: string, signal?: AbortSignal): Promise<PageContent> {
  const url = normalizeUrl(rawUrl)
  if (!isProbablyUrl(url)) throw new Error(`"${rawUrl}" doesn't look like a URL.`)

  let res: Response
  try {
    res = await fetch(READER + url, {
      headers: { Accept: 'text/plain' },
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new Error(
      'Could not reach the page reader (r.jina.ai). Check your connection and try again.',
    )
  }

  if (res.status === 429) throw new Error('The page reader is rate-limiting us. Wait a minute and retry.')
  if (!res.ok) throw new Error(`The page reader returned HTTP ${res.status} for ${url}.`)

  const body = await res.text()
  const text = body.trim()
  if (text.length < 200) {
    throw new Error(
      `That page returned almost no text (${text.length} chars). It may need a login, or be the wrong URL.`,
    )
  }

  return {
    url,
    text: text.slice(0, MAX_CHARS),
    fetchedAt: Date.now(),
    truncated: text.length > MAX_CHARS,
  }
}
