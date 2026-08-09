// Vendor-neutral LLM client for the research layer (spec §28: "do not hardcode
// the entire application around one vendor").
//
// Any OpenAI-compatible /chat/completions endpoint works. It defaults to the
// DeepSeek key the tracker already stores, so the planner doesn't ask for a key
// that is right there, but the base URL and model are overridable — pointing at
// a different vendor, a local model, or a proxy is a settings change.
//
// SECURITY NOTE (spec §28 says never expose secrets in the bundle): on a static
// GitHub Pages site there is no server to hold a secret, so the key lives in
// this browser's localStorage and is sent straight to the provider. Nothing
// passes through any server of ours. The honest framing is that this is a
// personal-use key in a personal browser, not a shipped secret — and the
// baseUrl override is the seam where a proxy can be introduced later.

import { loadKey, loadModel } from '../../../lib/deepseek'

const BASE_URL_STORE = 'planner.llm.baseUrl.v1'
const MODEL_STORE = 'planner.llm.model.v1'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'

export function loadBaseUrl(): string {
  try {
    return localStorage.getItem(BASE_URL_STORE) || DEFAULT_BASE_URL
  } catch {
    return DEFAULT_BASE_URL
  }
}

export function saveBaseUrl(url: string): void {
  try {
    const v = url.trim().replace(/\/+$/, '')
    if (v) localStorage.setItem(BASE_URL_STORE, v)
    else localStorage.removeItem(BASE_URL_STORE)
  } catch {
    /* storage blocked */
  }
}

/** Planner model override; falls back to whatever the tracker is configured with. */
export function loadPlannerModel(): string {
  try {
    return localStorage.getItem(MODEL_STORE) || loadModel()
  } catch {
    return loadModel()
  }
}

export function savePlannerModel(m: string): void {
  try {
    const v = m.trim()
    if (v) localStorage.setItem(MODEL_STORE, v)
    else localStorage.removeItem(MODEL_STORE)
  } catch {
    /* storage blocked */
  }
}

export function hasCredentials(): boolean {
  return !!loadKey()
}

export class LlmError extends Error {}

/**
 * One JSON-mode completion. Throws LlmError with a message meant for the user —
 * a bare "Failed to fetch" tells them nothing about which of the several
 * possible causes actually applies.
 */
export async function complete(
  system: string,
  user: string,
  opts: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const key = loadKey()
  if (!key) throw new LlmError('No API key configured — add one in the tracker’s 📊 Overview → DeepSeek settings.')

  const endpoint = `${loadBaseUrl()}/chat/completions`
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: loadPlannerModel(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        max_tokens: opts.maxTokens ?? 1400,
        response_format: { type: 'json_object' },
      }),
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new LlmError(
      `Could not reach the model API (${endpoint}) — the request was blocked before any reply came back. ` +
        'Usual causes: no internet, a VPN/firewall blocking the host, or a browser privacy extension.',
    )
  }

  if (res.status === 401) throw new LlmError('The API key was rejected (401). Check it in the tracker’s DeepSeek settings.')
  if (res.status === 402) throw new LlmError('The provider says the account is out of balance (402).')
  if (res.status === 429) throw new LlmError('Rate-limited by the provider (429). Wait a moment and retry.')
  if (!res.ok) throw new LlmError(`Model API error ${res.status}.`)

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new LlmError('The model returned an empty response.')
  return text
}

/** Parse a JSON completion without letting a malformed reply kill the run. */
export function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    // Some models wrap JSON in prose or a code fence despite json mode.
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as T
    } catch {
      return null
    }
  }
}
