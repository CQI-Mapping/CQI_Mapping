// Shared clock hook: the current time, re-read on a minute tick so
// time-sensitive UI (the dashboards' greeting banner and date pill)
// stays true while the app sits open — across the 12:00 PM and 6:00 PM
// greeting boundaries, or across midnight. A dashboard rendered once
// would otherwise freeze on whatever hour it mounted at.

import { useEffect, useState } from 'react'

export function useClock(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
