// DeepSeek client — called directly from the browser (CORS-verified). The
// OpenAI-compatible chat endpoint reads a professor's reply body and returns a
// structured admissions read. The API key lives in localStorage only and is
// sent straight to api.deepseek.com; nothing passes through any server of ours.
// This is opt-in: no key ⇒ no bodies are ever read or sent.

import type { ReplyAnalysis } from '../types'

const KEY_STORE = 'tracker.deepseek.key.v1'
const MODEL_STORE = 'tracker.deepseek.model.v1'
const ENABLED_STORE = 'tracker.deepseek.enabled.v1'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'

/** `deepseek-chat` maps to v4-flash (non-thinking); retires 2026/07/24, after
 *  which use `deepseek-v4-flash`. Cheap + fine for extraction. */
export const DEFAULT_MODEL = 'deepseek-chat'

export function loadKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}
export function saveKey(k: string): void {
  try {
    localStorage.setItem(KEY_STORE, k.trim())
  } catch {
    /* ignore */
  }
}
export function loadModel(): string {
  try {
    return localStorage.getItem(MODEL_STORE) || DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}
export function saveModel(m: string): void {
  try {
    localStorage.setItem(MODEL_STORE, m.trim() || DEFAULT_MODEL)
  } catch {
    /* ignore */
  }
}
export function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_STORE) === '1'
  } catch {
    return false
  }
}
export function saveEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_STORE, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** AI analysis is active only when explicitly enabled AND a key is present. */
export function aiActive(): boolean {
  return loadEnabled() && !!loadKey()
}

async function chat(
  messages: { role: string; content: string }[],
  opts: { json?: boolean } = {},
): Promise<string> {
  const key = loadKey()
  if (!key) throw new Error('No DeepSeek API key')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: loadModel(),
      messages,
      temperature: 0.2,
      max_tokens: 400,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (res.status === 401) throw new Error('DeepSeek key rejected (401)')
  if (!res.ok) throw new Error(`DeepSeek API error ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** Extract admissions signals from one professor's reply body. */
export async function analyzeReply(
  body: string,
  ctx: { prof: string; university: string; program: string },
): Promise<ReplyAnalysis> {
  const sys =
    'You read a professor\'s reply to a prospective PhD student\'s cold ("套磁") email and extract admissions signals. Respond with ONLY a JSON object, no prose.'
  const user =
    `Professor: ${ctx.prof} at ${ctx.university} (${ctx.program}).\n` +
    `Reply email body:\n"""\n${body.slice(0, 6000)}\n"""\n\n` +
    `Return JSON exactly: {"recruiting":"yes|no|unclear","funding":"yes|no|unclear",` +
    `"tone":"positive|neutral|negative","askedToApply":true|false,` +
    `"summary":"one concise English sentence on what they said about taking students/funding"}`
  const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], {
    json: true,
  })
  const p = JSON.parse(out)
  const oneOf = <T extends string>(v: unknown, allowed: T[], dflt: T): T =>
    allowed.includes(v as T) ? (v as T) : dflt
  return {
    recruiting: oneOf(p.recruiting, ['yes', 'no', 'unclear'], 'unclear'),
    funding: oneOf(p.funding, ['yes', 'no', 'unclear'], 'unclear'),
    tone: oneOf(p.tone, ['positive', 'neutral', 'negative'], 'neutral'),
    askedToApply: !!p.askedToApply,
    summary: typeof p.summary === 'string' ? p.summary.slice(0, 300) : '',
    analyzedAt: Date.now(),
  }
}

/** Summarize one program's admissions situation from its faculty replies. */
export async function summarizeProgram(
  university: string,
  program: string,
  replies: { prof: string; recruiting: string; funding: string; summary: string }[],
): Promise<string> {
  const sys =
    'You summarize the PhD admissions/recruiting situation for one program from its faculty replies. Reply with 1–3 concrete sentences: who is recruiting, funding notes, and overall outlook. No preamble.'
  const user =
    `Program: ${program} at ${university}.\nFaculty replies:\n` +
    replies
      .map((r) => `- ${r.prof}: recruiting=${r.recruiting}, funding=${r.funding}. ${r.summary}`)
      .join('\n')
  return (
    await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { json: false })
  ).trim()
}
