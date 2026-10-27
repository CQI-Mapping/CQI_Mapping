// Probe set for the CLO closest-PO contract: exact / paraphrase /
// gibberish-always-suggest / empty. Keyword-only (offline-safe); semantic
// thresholds are calibrated separately (poOfficial.test + the mpnet
// calibration probe).

import { describe, expect, it } from 'vitest'
import { rankClosestPos, type PoText } from './poMatch'
import { buildGoldens, scoreAccuracy } from './poGolden'

const POS: PoText[] = [
  { code: 'PO-1', title: 'Apply computing knowledge to solve problems', extra: 'Bachelor of Science in Information Technology' },
  { code: 'PO-2', title: 'Design and develop software systems', extra: 'SPECIFIC TO A SUB-DISCIPLINE' },
  { code: 'PO-3', title: 'Communicate effectively with stakeholders', extra: null },
]

describe('rankClosestPos contract', () => {
  it('ranks exact keywords top with a strong score', () => {
    const [top] = rankClosestPos('Design and develop software systems', POS, 3)
    expect(top.code).toBe('PO-2')
    expect(top.score).toBeGreaterThan(50)
  })

  it('matches paraphrase via synonym groups', () => {
    const ranked = rankClosestPos('Build applications for clients', POS, 3)
    expect(ranked.slice(0, 3).map((r) => r.code)).toContain('PO-2')
  })

  it('uses enriched extra text for thin POs', () => {
    const [top] = rankClosestPos('information technology program', POS, 3)
    expect(top.code).toBe('PO-1')
  })

  it('always suggests top-3 even for gibberish (low confidence)', () => {
    const ranked = rankClosestPos('asdf qwer zxcv', POS, 3)
    expect(ranked).toHaveLength(3)
    expect(ranked[0].score).toBe(0)
  })

  it('returns [] for empty draft or empty corpus', () => {
    expect(rankClosestPos('   ', POS, 3)).toEqual([])
    expect(rankClosestPos('design software', [], 3)).toEqual([])
  })
})

describe('golden accuracy (keyword baseline)', () => {
  it('top-3 contains expected PO for exact + paraphrase drafts', () => {
    const pairs = buildGoldens(POS)
    expect(pairs.length).toBeGreaterThan(0)
    const acc = scoreAccuracy(pairs, (draft) =>
      rankClosestPos(draft, POS, 3).map((r) => r.code),
    )
    expect(acc.top3).toBeGreaterThanOrEqual(95)
    expect(acc.top1).toBeGreaterThanOrEqual(80)
  })
})
