// PDF export for the Curriculum Report (View.tsx).
//
// The pipeline is three stages:
//
// 1. html2pdf rasterises the live DOM and lays it out with jsPDF. The letterhead
//    is *hidden* during capture (via html2canvas's `onclone`, which edits the
//    offscreen copy rather than the live page) so it is not baked in once at
//    the top.
// 2. jsPDF emits the document as bytes instead of saving it.
// 3. pdf-lib stamps the letterhead artwork onto every page.
//
// Splitting it this way is what makes a *repeating* header possible. html2pdf
// has no page-header concept -- it slices one tall canvas into pages -- so
// there is no option that would repeat the letterhead on its own.
//
// Stage 1's `margin[0]` is applied to every page, not just the first (see
// html2pdf's context2d paging math: `j === 1 ? posY + margin[0] : margin[0]`).
// That reserved band is exactly where stage 3 draws, so nothing collides.

import { saveBlob, reportFileName } from './download'
import {
  LETTERHEAD_URL,
  LETTERHEAD_ASPECT,
  LETTERHEAD_WIDTH_RATIO,
  LETTERHEAD_TOP_IN,
  headerBandIn,
  pageWidthIn,
} from './letterhead'

export type ReportOrientation = 'portrait' | 'landscape'

const SIDE_MARGIN_IN = 0.5

async function fetchLetterheadBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LETTERHEAD_URL)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    // A missing letterhead degrades the PDF but must not fail the export.
    return null
  }
}

/** Pulls the raw bytes out of a jsPDF `datauristring` output. */
function dataUriToBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Rasterises `root` and saves it as a PDF carrying the letterhead on every page.
 *
 * Throws if the element is missing or the library fails, so the caller can
 * surface it through the existing error message.
 */
export async function downloadSyllabusPdf(
  root: HTMLElement,
  filename: string,
  orientation: ReportOrientation = 'landscape',
): Promise<void> {
  if (!root) throw new Error('Nothing to download — the report is not ready yet.')

  const { default: html2pdf } = await import('html2pdf.js')
  const bandIn = headerBandIn(pageWidthIn(orientation))

  // Built as a variable rather than passed inline: html2pdf.js 0.14.0's bundled
  // type declarations omit `pagebreak`, and TypeScript only runs excess-property
  // checks against *fresh* object literals. Handing `set()` a pre-built object
  // keeps the option accepted without an `as` cast or a module augmentation
  // (augmenting this package's ambient `declare module` does not merge).
  const config = {
    filename,
    // [top, right, bottom, left] in inches. Tuple-typed for the option's
    // 4-number overload; the top value reserves the header band on every page
    // -- see the note at the top of this file.
    margin: [bandIn, SIDE_MARGIN_IN, SIDE_MARGIN_IN, SIDE_MARGIN_IN] as [number, number, number, number],
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      // Hide the letterhead in the cloned DOM only; the live page is untouched
      // so the button causes no visible flicker.
      onclone: (clonedDoc: Document) => {
        clonedDoc.querySelectorAll('.sd-letterhead').forEach((el) => {
          ;(el as HTMLElement).style.display = 'none'
        })
      },
    },
    // Paper matches the official signed syllabus: 8.5 x 13in. Both readings of
    // the `format` array measure the same for a given orientation -- jsPDF
    // normalises the pair rather than blindly swapping it.
    jsPDF: {
      unit: 'in' as const,
      format: [8.5, 13] as [number, number],
      orientation: orientation === 'landscape' ? ('landscape' as const) : ('portrait' as const),
    },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: ['.sd-table', '.sd-po-sections', '.sd-mapping', '.panel'],
    },
  }

  // `toPdf()` + `outputPdf` produce the bytes instead of triggering a download.
  const dataUri = await html2pdf().set(config).from(root).toPdf().outputPdf('datauristring')

  let bytes = dataUriToBytes(dataUri)

  const letterhead = await fetchLetterheadBytes()
  if (letterhead) {
    try {
      // Dynamic, like html2pdf above: a static import here put ~960kB of
      // pdf-lib into the main chunk and charged every page load for it.
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(bytes)
      const image = await doc.embedPng(letterhead)
      const aspect = LETTERHEAD_ASPECT
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize()
        const w = width * LETTERHEAD_WIDTH_RATIO
        const h = w / aspect
        page.drawImage(image, {
          x: (width - w) / 2,
          y: height - h - LETTERHEAD_TOP_IN * 72,
          width: w,
          height: h,
        })
      }
      bytes = await doc.save()
    } catch {
      // If stamping fails for any reason, fall back to the unstamped PDF
      // rather than producing nothing at all.
    }
  }

  // `.buffer` rather than the view itself: BlobPart wants an ArrayBuffer, and
  // the Uint8Array that comes back from pdf-lib is typed ArrayBufferLike.
  saveBlob(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), filename)
}