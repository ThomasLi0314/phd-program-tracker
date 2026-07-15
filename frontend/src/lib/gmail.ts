// Client-side Gmail access via Google Identity Services (token model).
// No backend, no client secret: initTokenClient() issues a ~1h access token in
// the browser, which we send as a Bearer to the Gmail REST API. We only ever
// request format=metadata — headers only (To/Cc/From/Subject/Date/threadId),
// never message bodies. The access token lives in memory only (never persisted);
// only the public OAuth Client ID is stored in localStorage.

const GIS_SRC = 'https://accounts.google.com/gsi/client'
/** gmail.readonly for outreach sync; drive.appdata for the backup file (a
 *  private, app-only folder in the user's Drive — we cannot see their real files). */
const SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.appdata'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
export const CLIENT_ID_KEY = 'tracker.gmail.clientId.v1'

export function loadClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) ?? ''
  } catch {
    return ''
  }
}
export function saveClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id.trim())
  } catch {
    /* ignore */
  }
}

// ---- GIS script + token client (module singletons) ----

let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GIS_SRC}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisPromise
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function google(): any {
  return (window as any).google
}

let tokenClient: any = null
let clientIdInUse = ''
let accessToken: string | null = null
let tokenExpiry = 0
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null

async function ensureClient(clientId: string): Promise<void> {
  await loadGis()
  if (tokenClient && clientIdInUse === clientId) return
  tokenClient = google().accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: (resp: any) => {
      if (resp.error) {
        pending?.reject(new Error(resp.error_description || resp.error))
      } else {
        accessToken = resp.access_token
        // expires_in is seconds; refresh a minute early.
        tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000
        pending?.resolve(resp.access_token)
      }
      pending = null
    },
  })
  clientIdInUse = clientId
}

/** Request a token. `interactive` shows the consent/account picker; otherwise it
 *  tries silently (works within the 7-day testing-mode grant). */
function requestToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' })
    } catch (e) {
      pending = null
      reject(e as Error)
    }
  })
}

/** Interactive connect: prompts for consent and returns the account email. */
export async function connect(clientId: string): Promise<string> {
  await ensureClient(clientId)
  await requestToken(true)
  const profile = await getProfile()
  return profile.emailAddress
}

export function disconnect(): void {
  const t = accessToken
  accessToken = null
  tokenExpiry = 0
  if (t && google()?.accounts?.oauth2?.revoke) {
    try {
      google().accounts.oauth2.revoke(t, () => {})
    } catch {
      /* ignore */
    }
  }
}

/** A valid access token, refreshed silently if expired. Throws if not connected
 *  or the silent grant has lapsed (caller should prompt an interactive connect). */
export async function ensureToken(clientId: string): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken
  await ensureClient(clientId)
  return requestToken(false)
}

// ---- REST helpers (all metadata-only) ----

async function gget(path: string): Promise<any> {
  if (!accessToken) throw new Error('Not connected')
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) {
    accessToken = null
    tokenExpiry = 0
    throw new Error('Gmail token expired — reconnect')
  }
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`Gmail API busy (${res.status}) — try Sync again`)
  }
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`)
  return res.json()
}

export interface GmailProfile {
  emailAddress: string
  historyId: string
}
export function getProfile(): Promise<GmailProfile> {
  return gget('/profile')
}

const META_MSG =
  'format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From'

/** All sent message stubs matching `query` (paginated). */
export async function listSent(query: string): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = []
  let pageToken: string | undefined
  do {
    const qs =
      `/messages?maxResults=200&q=${encodeURIComponent(query)}` +
      (pageToken ? `&pageToken=${pageToken}` : '')
    const page = await gget(qs)
    for (const m of page.messages || []) out.push({ id: m.id, threadId: m.threadId })
    pageToken = page.nextPageToken
  } while (pageToken)
  return out
}

export interface MessageMeta {
  id: string
  threadId: string
  sentAt: number
  headers: Record<string, string>
}
export async function getMessageMeta(id: string): Promise<MessageMeta> {
  const m = await gget(`/messages/${id}?${META_MSG}`)
  const headers: Record<string, string> = {}
  for (const h of m.payload?.headers || []) headers[h.name.toLowerCase()] = h.value
  return { id: m.id, threadId: m.threadId, sentAt: Number(m.internalDate), headers }
}

export interface ThreadMessageMeta {
  from: string
  date: number
}
/** Thread messages with just From + internalDate — enough for reply detection. */
export async function getThreadMeta(threadId: string): Promise<ThreadMessageMeta[]> {
  const t = await gget(`/threads/${threadId}?format=metadata&metadataHeaders=From`)
  return (t.messages || []).map((m: any) => {
    const fromHeader = (m.payload?.headers || []).find(
      (h: any) => h.name.toLowerCase() === 'from',
    )
    return { from: fromHeader?.value ?? '', date: Number(m.internalDate) }
  })
}

// ---- full message bodies (only used by the opt-in DeepSeek feature) ----

function decodeB64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

function findPartData(payload: any, mime: string): string | null {
  if (payload?.mimeType === mime && payload.body?.data) return payload.body.data
  for (const p of payload?.parts || []) {
    const r = findPartData(p, mime)
    if (r) return r
  }
  return null
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractBody(payload: any): string {
  const plain = findPartData(payload, 'text/plain')
  if (plain) return decodeB64Url(plain)
  const html = findPartData(payload, 'text/html')
  if (html) return stripHtml(decodeB64Url(html))
  if (payload?.body?.data) return decodeB64Url(payload.body.data)
  return ''
}

export interface ThreadMessageFull {
  from: string
  date: number
  body: string
}
/** Full thread messages with decoded text bodies — for DeepSeek analysis. */
export async function getThreadFull(threadId: string): Promise<ThreadMessageFull[]> {
  const t = await gget(`/threads/${threadId}?format=full`)
  return (t.messages || []).map((m: any) => {
    const from = (m.payload?.headers || []).find((h: any) => h.name.toLowerCase() === 'from')?.value
    return { from: from ?? '', date: Number(m.internalDate), body: extractBody(m.payload) }
  })
}
