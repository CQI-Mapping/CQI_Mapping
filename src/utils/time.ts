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

/** 'Just now', '12 min ago', '3 hr ago', 'Yesterday', '4 days ago', then a
 *  short calendar date. Measured against `now` (epoch ms) so a dashboard can
 *  pass its ticking clock and keep the wording current. */
export function timeAgo(iso: string, now: number): string {
  const then = new Date(iso)
  if (isNaN(then.getTime())) return iso
  const minutes = Math.floor((now - then.getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const localDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((localDay(new Date(now)) - localDay(then)) / 86400000)
  if (days < 1) return `${Math.floor(minutes / 60)} hr ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const sameYear = then.getFullYear() === new Date(now).getFullYear()
  const options: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return then.toLocaleDateString([], options)
}
