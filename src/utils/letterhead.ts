// The letterhead artwork and its placement on the page, shared by the PDF and
// Word exports so both position it identically.
//
// The artwork is the department mark (public/ccs-logo.jpg, 219 x 125): a crest
// block with its college and school captions baked into the image. It is
// centred in the page's top band; the top offset and gap below still follow the
// geometry measured from the official signed syllabus.

export const LETTERHEAD_URL = '/ccs-logo.jpg'

// public/ccs-logo.jpg is 219 x 125px. Both exporters need the aspect
// ratio up front (pdf-lib to scale the stamp, docx to size the ImageRun), so it
// is declared rather than probed. If that artwork is ever replaced with
// different proportions, this constant must follow it.
export const LETTERHEAD_ASPECT = 219 / 125

/** Visible letterhead width as a fraction of the page width — about a quarter
 * of the page keeps the crest legible without crowding the body. */
export const LETTERHEAD_WIDTH_RATIO = 0.25

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