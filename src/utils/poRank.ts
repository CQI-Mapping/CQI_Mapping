// poRank: hybrid fusion rank for closest-PO.
//
// Combines keyword overlap (poMatch), MPNet semantic cosine (poSemantic),
// exact-phrase hits, Bloom-verb family alignment, per-browser click memory,
// and a stage-2 per-field rerank into ONE fused score per PO. Always returns
// best top-N (even at score 0) so the always-suggest contract holds; gates
// only decide auto-fill eligibility, never display.
//
// Calibrated 2026-10-05 on the golden fixture (poGolden + poRank.test) and
// re-calibrated 2026-10-28 on the official CMO 25 s. 2015 corpus
// (poOfficial + poOfficial.test): fused top1/top3 hold the pinned bars with
// the expanded lexicon and field rerank. Re-measure via `npm run test`
// after changing any constant here.

import { rankClosestPos, scorePo, type PoText, type RankedPo } from './poMatch'
import { boostFor, rejectionPenalty } from './poMemory'

export const EXACT_BONUS = 15
export const BLOOM_BONUS = 5
export const THIN_GATE = 25
export const RICH_GATE = 40

// Premium second stage: a whole-blob keyword score can dilute a strong
// sub-field match (a PO whose description rambles but whose title is nearly
// the draft). Finalists get re-scored against each text field separately
// and lifted toward the best field — this can only raise a score, never
// lower it, so gibberish and low-confidence behavior are unchanged.
export const FIELD_STAGE_W = 0.7

function fieldMax(draft: string, po: PoText): number {
  const fields = [po.title ?? '', po.description ?? '', po.extra ?? '']
  let best = 0
  for (const f of fields) {
    if (!f.trim()) continue
    const s = scorePo(draft, { code: po.code, title: f, description: null }).score
    if (s > best) best = s
  }
  return best
}

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
    const penalty = rejectionPenalty(draft, k.code)
    const bonus = (po ? exactBonus(draft, po) : 0) + (po ? bloomBonus(draft, po) : 0)
    const score = Math.max(0, Math.min(100, Math.max(0, base) + mem + bonus - penalty))
    const matched = s !== undefined && s > k.score ? [] : k.matched
    return { code: k.code, label: k.label, score, matched }
  })
  // Stage-2 field rerank: lift finalists whose title/description/extra
  // individually match the draft better than the whole-blob score shows.
  for (const f of fused) {
    const po = byCode.get(f.code)
    if (!po) continue
    const fm = fieldMax(draft, po)
    if (fm <= f.score) continue
    const blend = Math.round(FIELD_STAGE_W * fm + (1 - FIELD_STAGE_W) * f.score)
    if (blend > f.score) f.score = Math.min(100, blend)
  }
  fused.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
  // Deduplicate by code: keep the highest-scoring record if duplicate codes exist in DB.
  const seen = new Set<string>()
  const deduped: RankedPo[] = []
  for (const f of fused) {
    const key = f.code.trim().toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(f)
  }
  return deduped.slice(0, top)
}

/** Display view: relative percentage anchored at top = 100. Gates stay raw. */
export interface ShownPo extends RankedPo {
  /** Relative 0-100 for display (top raw > 0 maps to 100). */
  shown: number
  /** Raw fused score used by all gates. */
  raw: number
}

/** Top-anchored rescale for display only. Raw 0 top stays low-confidence. */
export function toRelative(ranked: RankedPo[]): ShownPo[] {
  const top = ranked[0]?.score ?? 0
  if (top <= 0) return ranked.map((r) => ({ ...r, shown: 0, raw: r.score }))
  return ranked.map((r) => ({ ...r, shown: Math.round((r.score / top) * 100), raw: r.score }))
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
