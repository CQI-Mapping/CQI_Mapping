// poGolden: self-calibrating golden set for closest-PO accuracy metrics.
//
// Derives pairs from the live PO corpus (each PO title → synthetic CLO
// drafts: exact title, synonym-swapped paraphrase) so thresholds tune against
// YOUR real POs without DB access in tests. Gibberish drafts assert the
// always-suggest low-confidence contract instead of accuracy.

import type { PoText } from './poMatch'

export interface GoldenPair {
  draft: string
  expected: string[] // acceptable PO codes (usually one)
  kind: 'exact' | 'paraphrase' | 'gibberish'
}

// Small swap map mirroring SYN_GROUPS in poMatch (draft-side wording only).
const SWAP: Record<string, string> = {
  develop: 'build',
  software: 'apps',
  evaluate: 'test',
  analyze: 'examine',
  design: 'plan',
  manage: 'maintain',
  communicate: 'present',
  solve: 'debug',
}

export function paraphrase(title: string): string {
  return title
    .split(/\s+/)
    .map((w) => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '')
      const swap = SWAP[clean]
      if (!swap) return w
      const cap = /^[A-Z]/.test(w) ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap
      return w.replace(/[A-Za-z]+/, cap)
    })
    .join(' ')
}

export function buildGoldens(pos: PoText[]): GoldenPair[] {
  const pairs: GoldenPair[] = []
  for (const po of pos) {
    if (!po.title?.trim()) continue
    pairs.push({ draft: po.title, expected: [po.code], kind: 'exact' })
    const para = paraphrase(po.title)
    if (para !== po.title) pairs.push({ draft: para, expected: [po.code], kind: 'paraphrase' })
  }
  pairs.push({ draft: 'asdf qwer zxcv', expected: [], kind: 'gibberish' })
  pairs.push({ draft: 'lorem ipsum dolor sit amet', expected: [], kind: 'gibberish' })
  return pairs
}

export interface Accuracy {
  top1: number // 0-100
  top3: number // 0-100
  misses: { draft: string; expected: string[]; got: string[] }[]
}

export function scoreAccuracy(
  pairs: GoldenPair[],
  rank: (draft: string) => string[],
): Accuracy {
  const scored = pairs.filter((p) => p.kind !== 'gibberish')
  let top1 = 0
  let top3 = 0
  const misses: Accuracy['misses'] = []
  for (const p of scored) {
    const got = rank(p.draft)
    const hit1 = got[0] !== undefined && p.expected.includes(got[0])
    const hit3 = got.some((c) => p.expected.includes(c))
    if (hit1) top1++
    if (hit3) top3++
    if (!hit3) misses.push({ draft: p.draft, expected: p.expected, got })
  }
  const pct = (n: number) => (scored.length === 0 ? 0 : Math.round((n / scored.length) * 100))
  return { top1: pct(top1), top3: pct(top3), misses }
}
