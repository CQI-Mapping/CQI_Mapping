// The letterhead artwork and its placement on the page, shared by the PDF and
// Word exports so both position it identically.
//
// Every constant here was measured from the official signed syllabus rather
// than estimated: the PDF places one 2500x1767 image at x=47.25 spanning
// 842.25pt on a 936pt page, and the visible content inside that image runs from
// 392/2500 to 2088/2500. That puts the artwork at 571.4pt wide -- 61% of the
// page -- centred with ~2.5in insets, NOT flush to the margins.

export const LETTERHEAD_URL = '/nbsc-letterhead.png'

// public/nbsc-letterhead.png is 1712 x 192px. Both exporters need the aspect
// ratio up front (pdf-lib to scale the stamp, docx to size the ImageRun), so it
// is declared rather than probed. If that artwork is ever replaced with
// different proportions, this constant must follow it.
export const LETTERHEAD_ASPECT = 1712 / 192

/** Visible letterhead width as a fraction of the page width. */
export const LETTERHEAD_WIDTH_RATIO = 0.61

/** Gap between the top of the page and the top of the letterhead. */
export const LETTERHEAD_TOP_IN = 0.14

/** Breathing room between the letterhead and the first line of content. */
export const LETTERHEAD_GAP_IN = 0.37

/** Letterhead height in inches for a given page width. */
export const letterheadHeightIn = (pageWidthIn: number) =>
  (pageWidthIn * LETTERHEAD_WIDTH_RATIO) / LETTERHEAD_ASPECT

/**
 * Height of the band the letterhead occupies at the top of the page. The body
 * starts below it, so the header never collides with content on any page.
 * Differs per orientation because the artwork scales with the page width.
 */
export const headerBandIn = (pageWidthIn: number) =>
  LETTERHEAD_TOP_IN + letterheadHeightIn(pageWidthIn) + LETTERHEAD_GAP_IN

/** Page width in inches for a report orientation (paper is 8.5 x 13). */
export const pageWidthIn = (orientation: 'portrait' | 'landscape') =>
  orientation === 'landscape' ? 13 : 8.5