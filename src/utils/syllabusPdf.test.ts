import { describe, it, expect } from 'vitest'
import { nextPageEnd } from './syllabusPdf'
import type { AvoidRange } from './syllabusPdf'

// A page holds bodyPagePx of content. The bug this guards against: slicing at
// exactly y + bodyPagePx cut a Program Outcomes group in half, stranding
// "6. Analyze complex problems..." at the foot of one page and "7. Apply
// computing..." at the top of the next.
const PAGE = 1000
const HEIGHT = 5000

describe('nextPageEnd', () => {
  it('advances by a full page when nothing is in the way', () => {
    expect(nextPageEnd(0, PAGE, HEIGHT, [])).toBe(1000)
    expect(nextPageEnd(1000, PAGE, HEIGHT, [])).toBe(2000)
  })

  it('never runs past the bottom of the sheet', () => {
    expect(nextPageEnd(4000, PAGE, 4500, [])).toBe(4500)
  })

  it('ends the page early rather than splitting a straddling block', () => {
    // block spans 900..1400, nominal break is at 1000 -- the page must end at
    // the block's top, not be stretched to 1401
    expect(nextPageEnd(0, PAGE, HEIGHT, [{ top: 900, bottom: 1400 }])).toBe(900)
  })

  it('leaves a block that ends exactly on the break alone', () => {
    expect(nextPageEnd(0, PAGE, HEIGHT, [{ top: 500, bottom: 1000 }])).toBe(1000)
  })

  it('ignores a block entirely below the break', () => {
    expect(nextPageEnd(0, PAGE, HEIGHT, [{ top: 1200, bottom: 1800 }])).toBe(1000)
  })

  it('ignores a block entirely above the break', () => {
    expect(nextPageEnd(1000, PAGE, HEIGHT, [{ top: 100, bottom: 900 }])).toBe(2000)
  })

  it('cannot avoid a block taller than a page, so cuts normally', () => {
    // 500..2500 is 2000px tall against a 1000px page -- unsatisfiable
    expect(nextPageEnd(0, PAGE, HEIGHT, [{ top: 500, bottom: 2500 }])).toBe(1000)
  })

  it('ignores a block that starts before this page and straddles it', () => {
    // already inside the block on arrival; ending at its top would not advance
    expect(nextPageEnd(500, PAGE, HEIGHT, [{ top: 500, bottom: 2500 }])).toBe(1500)
  })

  it('takes the earliest straddling block when several overlap the break', () => {
    // breaks must land before *all* of them; 700 is the first block's top
    const ranges: AvoidRange[] = [
      { top: 700, bottom: 1300 },
      { top: 900, bottom: 1600 },
    ]
    expect(nextPageEnd(0, PAGE, HEIGHT, ranges)).toBe(700)
  })

  it('walks the whole sheet, never cutting inside a satisfiable block', () => {
    const ranges: AvoidRange[] = [
      { top: 900, bottom: 1400 },
      { top: 2150, bottom: 2600 },
      { top: 3100, bottom: 3400 },
    ]
    const cuts: number[] = []
    let y = 0
    for (let guard = 0; y < HEIGHT && guard < 50; guard++) {
      const end = nextPageEnd(y, PAGE, HEIGHT, ranges)
      expect(end, 'must always make progress').toBeGreaterThan(y)
      cuts.push(end)
      y = end
    }
    expect(cuts[cuts.length - 1], 'must reach the bottom of the sheet').toBe(HEIGHT)

    for (const cut of cuts) {
      for (const r of ranges) {
        expect(
          cut > r.top && cut < r.bottom,
          `cut at ${cut} landed inside block ${r.top}..${r.bottom}`,
        ).toBe(false)
      }
    }
  })

  it('always terminates on a sheet full of oversized blocks', () => {
    const ranges: AvoidRange[] = Array.from({ length: 40 }, (_, i) => ({
      top: i * 100,
      bottom: i * 100 + 2000, // every one taller than a page
    }))
    let y = 0
    for (let guard = 0; y < HEIGHT && guard < 100; guard++) {
      const end = nextPageEnd(y, PAGE, HEIGHT, ranges)
      expect(end).toBeGreaterThan(y)
      y = end
    }
    expect(y).toBe(HEIGHT)
  })
})