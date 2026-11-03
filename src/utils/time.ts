// Timestamp formatting shared by the Profile and Security & Privacy pages —
// one helper so the hero chip, the fact tiles and the activity timelines can
// never disagree about how "yesterday" is written.

/** 'Today · 9:14 AM', 'Yesterday · …', or a short calendar date. */
export function formatDayTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const localDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((localDay(now) - localDay(d)) / 86400000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (diffDays <= 0) return `Today · ${time}`
  if (diffDays === 1) return `Yesterday · ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`
}

/** Relative stamps for the activity trail: 'just now', '5m ago', '3h ago',
 *  '2d ago' — then a short calendar date once a week has passed. Callers
 *  pass `now` (the Profile page ticks one) so labels stay honest and tests
 *  stay deterministic. Pair with formatDayTime as a tooltip for the exact
 *  moment. A future timestamp (clock skew) reads 'just now', never a
 *  negative 'ago'. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const elapsed = now.getTime() - d.getTime()
  if (elapsed < 60_000) return 'just now'
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
