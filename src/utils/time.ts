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
