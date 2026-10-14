// PDF export for the Curriculum Report (View.tsx).
//
// Why this does not use html2pdf.js: that library rasterises the DOM as one
// continuous strip and slices the strip into pages, so it has no page-header
// concept — the letterhead could only ever appear on page 1, while the
// official signed syllabus carries it on all 12. Building the PDF page by page
// with html2canvas + jsPDF gives exact control: the letterhead is placed at the
// same measured position on every page, and the report body is sliced to the
// height left below the header band.
//
// This also drops html2pdf entirely (and pdf-lib, which the previous
// implementation used to stamp the artwork after the fact). Placement constants
// come from utils/letterhead.ts, which measured them from the signed syllabus:
// the artwork spans 61% of the page width, centred, 0.14in from the top — not
// flush to the margins. Both exporters read those constants so they cannot
// drift apart.
//
// Two behaviours the previous implementation relied on are preserved:
//  - lazy-loading, so the rasteriser and jsPDF stay out of the initial bundle
//  - rasterising `.syllabus-doc__page`, never `.syllabus-doc`, because
//    html2canvas renders with screen CSS and does NOT honour `no-print` (a
//    @media print rule). Targeting the outer wrapper would bake the toolbar —
//    subject dropdown, Edit and Print buttons — into the PDF.

import {
  LETTERHEAD_URL,
  LETTERHEAD_ASPECT,
  LETTERHEAD_WIDTH_RATIO,
  LETTERHEAD_TOP_IN,
  headerBandIn,
} from './letterhead'
import { saveBlob } from './download'

export type ReportOrientation = 'portrait' | 'landscape'

// Paper matches the official signed syllabus: 8.5 x 13in, rotated either way.
const PAGE = { landscape: { w: 13, h: 8.5 }, portrait: { w: 8.5, h: 13 } } as const
// jsPDF v4 gives addImage a TOP-DOWN y (the canvas convention), unlike v2/v3
// which measured y up from the bottom-left. Verified against this build: y=0.25
// lands 0.25in below the page top, y=7.5 lands 7.5in below it. Every jsPDF
// example written before v4 assumes the opposite, so "fixing" these values to
// the documented v2 behaviour flips the letterhead to the bottom of the page.
const SIDE_MARGIN_IN = 0.5
const SCALE = 2
const CSS_DPI = 96

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    // A missing letterhead must not abort the export; the page just loses it.
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** jsPDF needs a data URL; the header is a PNG so it is re-encoded losslessly. */
function imageToDataUrl(img: HTMLImageElement): string {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the letterhead image.')
  ctx.drawImage(img, 0, 0)
  return c.toDataURL('image/png')
}

/**
 * Rasterises `root` and saves it as a PDF carrying the letterhead on every
 * page. Throws if the element is missing or a library fails, so the caller can
 * surface it through the existing error message.
 */
export async function downloadSyllabusPdf(
  root: HTMLElement,
  filename: string,
  orientation: ReportOrientation = 'landscape',
): Promise<void> {
  if (!root) throw new Error('Nothing to download — the report is not ready yet.')

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const { w: pageW, h: pageH } = PAGE[orientation]
  const bandIn = headerBandIn(pageW)
  const contentWIn = pageW - SIDE_MARGIN_IN * 2
  const bodyHIn = pageH - bandIn - SIDE_MARGIN_IN
  const contentWPx = Math.round(contentWIn * CSS_DPI)

  // Render the report offscreen at the exact printable width so the tables
  // reflow to the page rather than to whatever the browser window happened to
  // be. Cloning also drops any live edit state held only in React.
  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;left:-100000px;top:0;width:${contentWPx}px;background:#fff;z-index:-1;`
  const clone = root.cloneNode(true) as HTMLElement
  // Drop the on-screen card chrome — the printable page supplies its own
  // margins, and the panel's padding/border would otherwise eat into them.
  clone.style.padding = '0'
  clone.style.border = 'none'
  // The header is placed on every page below, so drop the in-flow copy that
  // would otherwise put a second letterhead at the top of page 1.
  clone.querySelector('.sd-letterhead')?.remove()
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    const sheet = await html2canvas(host, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: contentWPx,
    })

    const pxPerIn = (sheet.width / contentWPx) * CSS_DPI
    const bodyHPx = Math.max(1, Math.round(bodyHIn * pxPerIn))
    const boxW = Math.round(contentWIn * pxPerIn)

    const letterhead = await loadImage(LETTERHEAD_URL)
    const headerW = pageW * LETTERHEAD_WIDTH_RATIO
    const headerH = headerW / LETTERHEAD_ASPECT
    const headerX = (pageW - headerW) / 2

    const pdf = new jsPDF({
      unit: 'in',
      // jsPDF swaps a format array for landscape, so give it the short side
      // first and let the orientation flag decide.
      format: [Math.min(pageW, pageH), Math.max(pageW, pageH)],
      orientation,
      compress: true,
    })

    const headerUrl = letterhead ? imageToDataUrl(letterhead) : null
    const pageCount = Math.max(1, Math.ceil(sheet.height / bodyHPx))
    for (let i = 0; i < pageCount; i++) {
      if (i > 0) pdf.addPage([Math.min(pageW, pageH), Math.max(pageW, pageH)], orientation)

      if (headerUrl) pdf.addImage(headerUrl, 'PNG', headerX, LETTERHEAD_TOP_IN, headerW, headerH)

      const sy = i * bodyHPx
      const sh = Math.min(bodyHPx, sheet.height - sy)
      if (sh <= 0) continue

      // The final slice is often shorter than a full page; scale it by its own
      // height so nothing is stretched to fill.
      const slice = document.createElement('canvas')
      slice.width = sheet.width
      slice.height = sh
      const ctx = slice.getContext('2d')
      if (!ctx) throw new Error('Could not prepare the PDF canvas.')
      ctx.drawImage(sheet, 0, sy, sheet.width, sh, 0, 0, sheet.width, sh)

      // Starts below the reserved header band, not at the side margin, so the
      // body never runs up into the letterhead.
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        SIDE_MARGIN_IN,
        bandIn,
        contentWIn,
        sh / pxPerIn,
      )
    }

    saveBlob(new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }), filename)
  } finally {
    host.remove()
  }
}
