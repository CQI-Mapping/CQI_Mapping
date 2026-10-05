// poRank: hybrid fusion rank for closest-PO.
//
// Combines keyword overlap (poMatch), MiniLM semantic cosine (poSemantic),
// exact-phrase hits, Bloom-verb family alignment, and per-browser click
// memory into ONE fused score per PO. Always returns best top-N (even at
// score 0) so the always-suggest contract holds; gates only decide
// auto-fill eligibility, never display.

import { rankClosestPos, type PoText, type RankedPo } from './poMatch'
import { boostFor } from './poMemory'

export const EXACT_BONUS = 15
export const BLOOM_BONUS = 5
export const THIN_GATE = 25
export const RICH_GATE = 40

// Bloom-verb families — lead verbs in the same family share intent.
const BLOOM_FAMILIES: string[][] = [
  ['analyze', 'compare', 'contrast', 'examine', 'investigate', 'differentiate'],
  ['evaluate', 'test', 'assess', 'validate', 'measure', 'justify'],
  ['design', 'create', 'develop', 'build', 'plan', 'construct'],
  ['apply', 'implement', 'utilize', 'demonstrate', 'solve'],
  ['understand', 'explain', 'identify', 'interpret', 'describe'],
]

const BLOOM_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const f of BLOOM_FAMILIES) for (const w of f) m.set(w, f[0])
  return m
})()

function leadWord(s: string): string {
  const m = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)[0]
  return m ?? ''
}

function exactBonus(draft: string, po: PoText): number {
  const d = draft.toLowerCase()
  if (po.code && d.includes(po.code.toLowerCase())) return EXACT_BONUS
  const title = (po.title ?? '').toLowerCase().trim()
  if (title.length >= 12 && (d.includes(title) || title.includes(d.trim()))) return 10
  return 0
}

function bloomBonus(draft: string, po: PoText): number {
  const dw = BLOOM_MAP.get(leadWord(draft))
  const pw = BLOOM_MAP.get(leadWord(po.title ?? ''))
  return dw !== undefined && dw === pw ? BLOOM_BONUS : 0
}

function isThin(po: PoText): boolean {
  const n = `${po.code} ${po.title ?? ''} ${po.description ?? ''} ${po.extra ?? ''}`
    .split(/\s+/).filter(Boolean).length
  return n <= 8
}

/** Minimum fused score for auto-fill eligibility (display always shows top-N). */
export function gateFor(po: PoText): number {
  return isThin(po) ? THIN_GATE : RICH_GATE
}

export function fuseRanked(
  draft: string,
  keyword: RankedPo[],
  semantic: RankedPo[] | null,
  pos: PoText[],
  top = 3,
): RankedPo[] {
  if (!draft.trim() || pos.length === 0) return []
  const byCode = new Map(pos.map((p) => [p.code, p]))
  const sem = new Map((semantic ?? []).map((r) => [r.code, r.score]))
  const fused = keyword.map((k) => {
    const po = byCode.get(k.code)
    const s = sem.get(k.code)
    const base = Math.max(k.score, s ?? -1)
    const mem = boostFor(draft, k.code, Math.max(0, base))
    const bonus = (po ? exactBonus(draft, po) : 0) + (po ? bloomBonus(draft, po) : 0)
    const score = Math.min(100, Math.max(0, base) + mem + bonus)
    const matched = s !== undefined && s > k.score ? [] : k.matched
    return { code: k.code, label: k.label, score, matched }
  })
  fused.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
  return fused.slice(0, top)
}

/** Convenience: keyword rank + fusion in one call (semantic optional). */
export function rankFused(
  draft: string,
  pos: PoText[],
  semantic: RankedPo[] | null = null,
  top = 3,
): RankedPo[] {
  return fuseRanked(draft, rankClosestPos(draft, pos, Math.max(top, pos.length)), semantic, pos, top)
}
