// Links into the Gmail web UI for the outreach records.
//
// Kept apart from lib/gmail (the API client with the in-memory token) because
// these are plain URLs: opening one needs no token and no scope — it just
// takes you to the conversation in the mailbox you are signed into.
//
// `authuser` picks the account that was synced, so a browser signed into
// several Google accounts (personal + school) opens the right mailbox; without
// it Gmail uses whichever account is signed in first.

function mailbox(account?: string | null): string {
  return account
    ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}`
    : 'https://mail.google.com/mail/u/0/'
}

/** One conversation. Gmail's web UI accepts the API's hex thread id directly. */
export function gmailThreadUrl(threadId: string, account?: string | null): string {
  return `${mailbox(account)}#all/${threadId}`
}

/** A Gmail search, for records with no synced thread (the ones entered by hand). */
export function gmailSearchUrl(query: string, account?: string | null): string {
  return `${mailbox(account)}#search/${encodeURIComponent(query)}`
}

/**
 * Where "open in Gmail" should go for a record: its thread when it has one,
 * otherwise a search for the address, or failing that the professor's name.
 * null when there is nothing to search for.
 */
export function gmailLinkFor(
  record: { threadId?: string; toAddress?: string; toName?: string },
  account: string | null | undefined,
  name?: string,
): { url: string; exact: boolean } | null {
  if (record.threadId) return { url: gmailThreadUrl(record.threadId, account), exact: true }
  const address = record.toAddress?.trim()
  if (address) return { url: gmailSearchUrl(`to:${address} OR from:${address}`, account), exact: false }
  const who = (name || record.toName || '').trim()
  if (who) return { url: gmailSearchUrl(`"${who}"`, account), exact: false }
  return null
}
