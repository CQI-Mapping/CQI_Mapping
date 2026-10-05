// Fusion accuracy: exact-phrase + Bloom bonuses lift the right PO to top-1,
// and fused top-3 stays >=95% on the golden set.

import { describe, expect, it } from 'vitest'
import { rankClosestPos, type PoText } from './poMatch'
import { fuseRanked, rankFused } from './poRank'
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
    const kw = full('Design and develop software systems')
    const sem = [{ code: 'PO-1', label: 'PO-1', score: 90, matched: [] }]
    const [top] = fuseRanked('Design and develop software systems', kw, sem, POS, 3)
    expect(top.code).toBe('PO-1')
  })
})
