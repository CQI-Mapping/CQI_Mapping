// PDF export for the Curriculum Report document (View.tsx).
//
// html2pdf.js rasterises the report DOM through html2canvas and lays the
// result out with jsPDF. Two constraints drive the implementation:
//
// 1. It must lazy-load. html2pdf.js is ~750 KB and nothing else needs it, so
//    it is pulled in on first click rather than shipped in the initial
//    bundle — same convention as poSemantic.ts loading @xenova/transformers.
// 2. It must snapshot `.syllabus-doc__page`, never `.syllabus-doc`. html2canvas
//    renders with screen CSS and does NOT honour the `no-print` class (that is
//    a @media print rule), so targeting the outer wrapper would bake the
//    toolbar — subject dropdown, Edit and Print buttons — into the PDF.
//    The inner page wrapper holds the document only.
//
// Page breaks are approximate: html2canvas slices the canvas at CSS-break
// boundaries, so the `avoid` selectors mirror the `break-inside: avoid` rules
// the stylesheet already declares for print (index.css). Tables are the
// elements that actually get cut through, so they are the ones to protect.

/** Turns "IT21 - Object Oriented Programming" into "IT21-Object-Oriented-Programming". */
export function pdfFileSlug(code: string, date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  const safeCode = code.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-')
  return `syllabus-${safeCode || 'report'}-${stamp}.pdf`
}

/**
 * Rasterises `root` and saves it as a PDF.
 *
 * Throws if the element is missing or the library fails, so the caller can
 * surface it through the existing error message.
 */
export async function downloadSyllabusPdf(root: HTMLElement, filename: string): Promise<void> {
  if (!root) throw new Error('Nothing to download — the report is not ready yet.')

  const { default: html2pdf } = await import('html2pdf.js')

  // Built as a variable rather than passed inline: html2pdf.js 0.14.0's bundled
  // type declarations omit `pagebreak`, and TypeScript only runs excess-property
  // checks against *fresh* object literals. Handing `set()` a pre-built object
  // keeps the option accepted without an `as` cast or a module augmentation
  // (augmenting this package's ambient `declare module` does not merge).
  const config = {
    filename,
    // Margin is expressed in the jsPDF unit above — inches here, not mm. A
    // leftover mm value would become a 10in margin on a 13in-wide page.
    margin: 0.5,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      // The letterhead is a same-origin asset served from /public. `logging`
      // stays false so a 404 on it degrades to a blank slot rather than
      // aborting the export.
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    },
    // Page geometry matches the official signed syllabus, which is Legal-size
    // landscape: 13in x 8.5in (verified as 936 x 612pt in the reference PDF).
    // The Vision/Mission/Goals/PEO table is four columns wide and the Curriculum
    // Mapping matrix is three, so the document is laid out landscape — A4
    // portrait clips them.
    //
    // jsPDF normalises a `format` array for landscape regardless of the order
    // given (both [8.5, 13] and [13, 8.5] measure 13 x 8.5in), so there is no
    // double-swap to worry about here.
    jsPDF: {
      unit: 'in' as const,
      // Tuple-typed so it satisfies the `[number, number]` the option expects;
      // a plain array literal infers as `number[]`.
      format: [8.5, 13] as [number, number],
      orientation: 'landscape' as const,
    },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: ['.sd-table', '.sd-po-sections', '.sd-mapping', '.panel', '.sd-letterhead'],
    },
  }

  await html2pdf().set(config).from(root).save()
}