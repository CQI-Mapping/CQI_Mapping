// Fusion accuracy: exact-phrase + Bloom bonuses lift the right PO to top-1,
// and fused top-3 stays >=95% on the golden set.

import { describe, expect, it } from 'vitest'
import { rankClosestPos, type PoText } from './poMatch'
import { fuseRanked, rankFused, toRelative } from './poRank'
import { buildGoldens, scoreAccuracy } from './poGolden'

const POS: PoText[] = [
  { code: 'PO-1', title: 'Apply computing knowledge to solve problems', extra: 'Bachelor of Science in Information Technology' },
  { code: 'PO-2', title: 'Design and develop software systems', extra: 'SPECIFIC TO A SUB-DISCIPLINE' },
  { code: 'PO-3', title: 'Communicate effectively with stakeholders', extra: null },
]

const full = (draft: string) =>
  rankClosestPos(draft, POS, Math.max(3, POS.length))

describe('fuseRanked', () => {
  it('quotes the PO code to top-1 via exact-phrase bonus', () => {
    const draft = 'See PO-3 for details on reporting'
    const ranked = fuseRanked(draft, full(draft), null, POS, 3)
    expect(ranked[0].code).toBe('PO-3')
  })

  it('keeps golden top-3 accuracy >=95% without semantic', () => {
    const pairs = buildGoldens(POS)
    const acc = scoreAccuracy(pairs, (draft) =>
      fuseRanked(draft, full(draft), null, POS, 3).map((r) => r.code),
    )
    expect(acc.top3).toBeGreaterThanOrEqual(95)
  })

  it('merges semantic winners over keyword order', () => {
    const draft = 'Design and develop software systems'
    const kw = full(draft)
    // Premium: the stage-2 field rerank lifts PO-2 (its title matches the
    // draft verbatim) to ~97, so a true semantic winner has to out-score
    // that — a real paraphrase lands ~99 on mpnet cosine.
    const sem = [{ code: 'PO-1', label: 'PO-1', score: 99, matched: [] }]
    const [top, second] = fuseRanked(draft, kw, sem, POS, 3)
    expect(top.code).toBe('PO-1')
    expect(second.code).toBe('PO-2')
  })

  it('holds golden accuracy targets after fusion (measured 2026-10-05)', () => {
    const pairs = buildGoldens(POS)
    const acc = scoreAccuracy(pairs, (draft) =>
      fuseRanked(draft, full(draft), null, POS, 3).map((r) => r.code),
    )
    // Measured on fixture: top1 100, top3 100. Gates: top3 >= 95, top1 >= 80.
    expect(acc.top3).toBeGreaterThanOrEqual(95)
    expect(acc.top1).toBeGreaterThanOrEqual(80)
  })

  it('relative display anchors top at 100 and keeps raw for gates', () => {
    const ranked = fuseRanked('Design and develop software systems', full('Design and develop software systems'), null, POS, 3)
    const shown = toRelative(ranked)
    expect(shown[0].shown).toBe(100)
    expect(shown[0].raw).toBe(ranked[0].score)
    // Order preserved, rest scaled below top.
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i].shown).toBeLessThanOrEqual(shown[i - 1].shown)
    }
  })

  it('relative display stays low-confidence when raw top is 0', () => {
    const ranked = fuseRanked('asdf qwer zxcv', full('asdf qwer zxcv'), null, POS, 3)
    const shown = toRelative(ranked)
    expect(shown).toHaveLength(3)
    expect(shown.every((r) => r.shown === 0)).toBe(true)
  })

  it('deduplicates ranked results by code', () => {
    const dupPos: PoText[] = [
      { code: 'PO 5', title: 'Design, implement and evaluate computer-based systems' },
      { code: 'PO 3', title: 'Design and develop computing solutions' },
      { code: 'PO 5', title: 'Identify and analyze user needs in computer-based systems' },
    ]
    const kw = rankClosestPos('Design, implement, test and debug programs', dupPos, 3)
    const fused = fuseRanked('Design, implement, test and debug programs', kw, null, dupPos, 3)
    const codes = fused.map((r) => r.code)
    expect(codes).toHaveLength(2)
    expect(codes).toEqual(['PO 5', 'PO 3'])
  })
})
