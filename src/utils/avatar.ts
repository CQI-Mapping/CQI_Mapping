// Avatar helpers: every account gets a picture derived from its email, with
// zero setup — the address is hashed (SHA-256, per Gravatar's current spec)
// and turned into a Gravatar image URL. Users with a real Gravatar account
// automatically get their own photo; everyone else gets an `initials`-style
// image whose colour is generated from the hash, so two accounts never look
// alike. An explicitly uploaded picture (profile.avatar_url) always wins.

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
 * `d=initials` with locally computed letters keeps the picture sensible for
 * accounts that never registered a Gravatar profile.
 */
export async function gravatarUrl(
  email: string | null | undefined,
  size = 256,
  initials?: string,
): Promise<string | null> {
  const hash = await gravatarHash(email)
  if (!hash) return null
  const params = new URLSearchParams({ s: String(size), d: 'initials' })
  if (initials) params.set('initials', initials)
  return `https://gravatar.com/avatar/${hash}?${params.toString()}`
}
