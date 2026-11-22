// DeepSeek's Search API (released 2026-11-13): a query in, result pages with
// their text out, on the key the app already has. Its preflight allows this
// site's origin, so it works with no server of ours. Billed per search that
// finds something ($0.75 per thousand when this was written).

import { loadKey } from '../../../lib/deepseek'
import { isDeepSeek, LlmError } from './llm'

const ENDPOINT = 'https://api.deepseek.com/v1/tools/search'
/** The API refuses a longer query. */
const MAX_QUERY = 128

export interface SearchResult {
  url: string
  title: string
  /** The page's text; empty when the search had none to give. */
  content: string
}

/**
 * The key belongs to whatever the base URL points at, so it only goes to
 * DeepSeek's search when that is DeepSeek.
 */
export function canSearch(): boolean {
  return isDeepSeek() && !!loadKey()
}

export async function searchWeb(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  if (!canSearch()) throw new LlmError('Web search needs DeepSeek’s own API and a key.')
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loadKey()}` },
      body: JSON.stringify({ query: [...query].slice(0, MAX_QUERY).join(''), count: 5, need_content: true }),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new LlmError('DeepSeek’s web search could not be reached.')
  }
  if (res.status === 401) throw new LlmError('DeepSeek’s web search rejected the API key (401).')
  if (res.status === 402) throw new LlmError('DeepSeek says the account is out of balance (402).')
  if (res.status === 429) throw new LlmError('DeepSeek’s web search is rate-limiting; try again in a minute.')
  if (!res.ok) throw new LlmError(`DeepSeek’s web search answered with an error (${res.status}).`)

  const body = await res.json().catch(() => null)
  if (!Array.isArray(body?.results)) throw new LlmError('DeepSeek’s web search sent a reply this app can’t read.')
  return (body.results as Record<string, unknown>[])
    .filter((r) => typeof r?.url === 'string')
    .map((r) => ({
      url: r.url as string,
      title: typeof r.title === 'string' ? r.title : '',
      content: typeof r.content === 'string' ? r.content : '',
    }))
}
