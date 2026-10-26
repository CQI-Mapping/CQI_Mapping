// Clock helpers for the dashboards' greeting banner: a time-of-day greeting
// with fixed boundaries, and a local-time ISO date for the banner's date
// pill (toISOString() is UTC and names the wrong day for Philippine
// evenings near local midnight, where the calendar has already rolled).

/** Morning before noon, afternoon until 6 PM, evening afterwards. */
export function timeGreeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The date part of `now` in local time, as YYYY-MM-DD. */
export function localISODate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
