// Avatar helpers: an explicitly uploaded picture (profile.avatar_url)
// always wins; below it sits the email's Gravatar photo when the account
// has one, and below that the app's own initials tile. Gravatar is asked
// for real account photos only (d=404), never its generated initials —
// those take their colour scheme from the email hash and can clash hard
// with the theme (e.g. purple letters on a green tile).

/** Up to two leading letters for an avatar tile; empty names read '··'. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '··'
  )
}

/**
 * SHA-256 of the normalized email, as hex — Gravatar's own recipe:
 * trim whitespace, lowercase, then digest. Returns null without an email.
 */
export async function gravatarHash(email: string | null | undefined): Promise<string | null> {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return null
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The email's Gravatar image URL, or null when there is nothing to hash.
 * `d=404` serves the account's real photo when the email has a Gravatar
 * identity and fails with 404 when it doesn't — loadEmailAvatar turns
 * that miss into null so the UI can fall back to its initials tile.
 */
export async function gravatarUrl(email: string | null | undefined, size = 256): Promise<string | null> {
  const hash = await gravatarHash(email)
  if (!hash) return null
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`
}

/**
 * The email's Gravatar photo URL once confirmed to exist (probed with an
 * off-DOM <img> — no 404 flash, no flash-of-missing-picture), else null
 * when there is no email or no Gravatar account behind it. Digits itself
 * resolve quickly; the caller's initials tile shows until it lands.
 */
export async function loadEmailAvatar(email: string | null | undefined, size = 256): Promise<string | null> {
  const url = await gravatarUrl(email, size)
  if (!url) return null
  if (typeof Image === 'undefined') return null // non-DOM test environment
  return await new Promise<string | null>((resolve) => {
    const probe = new window.Image()
    probe.onload = () => resolve(url)
    probe.onerror = () => resolve(null)
    probe.src = url
  })
}
