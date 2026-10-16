import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import RecordMixDonut from './RecordMixDonut'
import { buildRecordMix } from '../utils/reports'
import type { SummaryLine } from '../utils/reports'

// Server-rendered markup, not jsdom: the donut is pure geometry, and its only
// job is to hand React a set of paths. Reading the markup is enough to check
// that, and it needs no DOM to exist.

const line = (key: SummaryLine['key'], total: number): SummaryLine => ({
  key,
  title: key,
  active: total,
  archived: 0,
  total,
})

const render = (...summary: SummaryLine[]) =>
  renderToStaticMarkup(createElement(RecordMixDonut, { mix: buildRecordMix(summary) }))

describe('RecordMixDonut', () => {
  it('draws one wedge per record type that has records', () => {
    const html = render(line('programs', 2), line('courses', 6), line('clos', 4))
    // peos and pos are absent entirely, so no path and no legend row for them.
    expect(html.match(/<path/g)).toHaveLength(3)
    expect(html).toContain('programs')
    expect(html).toContain('clos')
    expect(html).not.toContain('peos')
  })

  // d3.arc() centres every wedge on the origin. Without the translate the whole
  // ring lands in the top-left corner of the viewBox and only a quarter of it
  // is on screen -- which looks like a broken chart, not like a missing
  // transform, so it is worth a test rather than an eyeball.
  it('translates the ring into the middle of the viewBox', () => {
    const html = render(line('courses', 6), line('clos', 6))
    expect(html).toContain('viewBox="0 0 220 220"')
    expect(html.match(/translate\(110 110\)/g)).toHaveLength(2)
  })

  it('shows the grand total in the hole', () => {
    const html = render(line('programs', 2), line('courses', 6), line('clos', 4))
    expect(html).toContain('>12<')
    expect(html).toContain('records')
  })

  // A fresh install has no records at all. The arcs have no angles to draw, so
  // this gets a plain ring instead of a blank square.
  it('renders an empty ring rather than nothing when there is no data', () => {
    const html = render(line('programs', 0), line('courses', 0))
    expect(html).toContain('<circle')
    expect(html).not.toContain('<path')
    expect(html).toContain('No records to chart')
  })

  it('names every number in the legend, so the arcs are not the only source', () => {
    const html = render(line('programs', 1), line('courses', 3))
    expect(html).toContain('25%')
    expect(html).toContain('75%')
    // The tooltip text carries the same pair, for hover and for the title.
    expect(html).toContain('programs: 1 (25%)')
  })
})
