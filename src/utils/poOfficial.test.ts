// Premium accuracy bar on the OFFICIAL CMO 25 s. 2015 corpus — the list
// faculty actually pick from (migration 010 rows). Keyword-fusion floor
// only (semantic runs in-browser on top), so these bars hold offline.
// Measured 2026-10-28: top1 100, top3 100 across 61 cases; bars pinned
// below leave headroom so future lexicon edits can't silently regress.

import { describe, expect, it } from 'vitest'
import { rankClosestPos } from './poMatch'
import { rankFused, toRelative } from './poRank'
import { OFFICIAL_POS, officialCases } from './poOfficial'

const full = (draft: string) => rankClosestPos(draft, OFFICIAL_POS, OFFICIAL_POS.length)

describe('official CMO 25 s. 2015 corpus (premium calibration)', () => {
  const cases = officialCases().filter((c) => c.kind !== 'gibberish')

  it('fixture covers exact + paraphrase + faculty drafts on the official list', () => {
    expect(OFFICIAL_POS).toHaveLength(17)
    expect(cases.length).toBeGreaterThanOrEqual(55)
  })

  it('holds top-1 accuracy >= 90% through keyword fusion', () => {
    let hit = 0
    for (const c of cases) {
      const got = rankFused(c.draft, OFFICIAL_POS, null, 3).map((r) => r.code)
      if (c.expected.includes(got[0])) hit++
    }
    const pct = Math.round((hit / cases.length) * 100)
    expect(pct).toBeGreaterThanOrEqual(90)
  })

  it('holds top-3 accuracy >= 95% through keyword fusion', () => {
    let hit = 0
    for (const c of cases) {
      const got = rankFused(c.draft, OFFICIAL_POS, null, 3).map((r) => r.code)
      if (got.some((g) => c.expected.includes(g))) hit++
    }
    const pct = Math.round((hit / cases.length) * 100)
    expect(pct).toBeGreaterThanOrEqual(95)
  })

  it('splits the CMO near-duplicates: each exact title leads its own top-1', () => {
    const po1 = rankFused(OFFICIAL_POS[0].title!, OFFICIAL_POS, null, 1)
    const sd3 = rankFused(OFFICIAL_POS.find((p) => p.code === 'SD-3')!.title!, OFFICIAL_POS, null, 1)
    expect(po1[0].code).toBe('PO-1')
    expect(sd3[0].code).toBe('SD-3')
  })

  it('gibberish stays low-confidence (raw 0, display 0)', () => {
    const shown = toRelative(rankFused('asdf qwer zxcv gibberish', OFFICIAL_POS, null, 3))
    expect(shown).toHaveLength(3)
    expect(shown.every((r) => r.shown === 0 && r.raw === 0)).toBe(true)
  })
})
