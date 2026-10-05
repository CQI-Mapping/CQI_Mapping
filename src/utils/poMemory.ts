// poMemory: per-browser click learning for closest-PO ranking.
//
// Records which PO faculty pick for which description keywords (localStorage
// only — never leaves the browser, safe for shared lab PCs with a Reset
// button in the CLO toolbar). Boosts previously-picked POs for similar
// drafts, capped so memory never overrides a strong semantic/keyword match.

const KEY = 'cqi.poClicks.v1'
const MAX_ENTRIES = 200
const BOOST_PER_PICK = 8
const BOOST_CAP = 24
const BOOST_BELOW = 70 // only boost bases below this score

type MemTable = Record<string, Record<string, number>>

function readMem(): MemTable {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as MemTable
  } catch {
    // Corrupt or unavailable storage — start fresh.
  }
  return {}
}

function writeMem(table: MemTable): void {
  try {
    const keys = Object.keys(table)
    const trimmed: MemTable = {}
    for (const k of keys.slice(-MAX_ENTRIES)) trimmed[k] = table[k]
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // Storage full or unavailable — ranking still works without memory.
  }
}

function signatureOf(draft: string): string {
  return draft
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .sort()
    .slice(0, 6)
    .join(' ')
}

export function recordPick(draft: string, poCode: string): void {
  const sig = signatureOf(draft)
  if (!sig || !poCode) return
  const table = readMem()
  const row = table[sig] ?? {}
  row[poCode] = (row[poCode] ?? 0) + 1
  table[sig] = row
  writeMem(table)
}

export function boostFor(draft: string, poCode: string, base: number): number {
  if (base >= BOOST_BELOW) return 0
  const sig = signatureOf(draft)
  if (!sig) return 0
  let picks = 0
  try {
    picks = readMem()[sig]?.[poCode] ?? 0
  } catch {
    return 0
  }
  return Math.min(picks * BOOST_PER_PICK, BOOST_CAP)
}

export function pickedBefore(draft: string, poCode: string): boolean {
  const sig = signatureOf(draft)
  if (!sig) return false
  try {
    return (readMem()[sig]?.[poCode] ?? 0) > 0
  } catch {
    return false
  }
}

export function clearMemory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ignore storage errors.
  }
}
