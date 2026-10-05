// Closest-PO matcher: ranks Program Outcomes by word overlap with a CLO description draft.
//
// Pure local string matching — no AI keys, no network, no TF dependency.
// Score = Jaccard token overlap between draft and "PO code + title + description",
// with a small bonus for covering more of the draft's keywords.

export interface PoText {
  code: string
  title: string | null
  description?: string | null
}

export interface RankedPo {
  code: string
  label: string
  score: number // 0-100
  matched: string[]
}

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by',
  'be', 'is', 'are', 'was', 'were', 'will', 'shall', 'can', 'able', 'that',
  'this', 'these', 'those', 'it', 'its', 'as', 'at', 'from', 'into', 'out',
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

function stem(t: string): string {
  // Tiny suffix strip so "programming/programs" and "systems/system" still match.
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3)
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2)
  if (t.length > 4 && t.endsWith('s')) return t.slice(0, -1)
  return t
}

function tokenSet(s: string): Set<string> {
  return new Set(tokens(s).map(stem))
}

export function scorePo(draft: string, po: PoText): { score: number; matched: string[] } {
  const d = tokenSet(draft)
  if (d.size === 0) return { score: 0, matched: [] }
  const p = tokenSet(`${po.code} ${po.title ?? ''} ${po.description ?? ''}`)
  if (p.size === 0) return { score: 0, matched: [] }
  const matched: string[] = []
  for (const t of d) if (p.has(t)) matched.push(t)
  if (matched.length === 0) return { score: 0, matched: [] }
  const union = new Set([...d, ...p])
  const jaccard = matched.length / union.size
  const coverage = matched.length / d.size // how much of the draft is covered
  const score = Math.round((jaccard * 0.6 + coverage * 0.4) * 100)
  return { score, matched }
}

export function rankClosestPos(draft: string, pos: PoText[], top = 3): RankedPo[] {
  if (!draft.trim()) return []
  return pos
    .map((po) => {
      const { score, matched } = scorePo(draft, po)
      const label = `${po.code} - ${po.title ?? ''}`.trim()
      return { code: po.code, label, score, matched }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .slice(0, top)
}
