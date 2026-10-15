// Shared helpers for the report's file exports.
//
// PDF and Word produce their file differently (html2pdf saves internally;
// Word yields a Blob), but the user-facing behaviour should be identical, so
// both funnel through saveBlob() to trigger one download with one filename.

/** Hands a generated file to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "syllabus-IT21-2026-10-14.pdf" / ".docx" — shared by both formats. */
export function reportFileName(code: string, ext: 'pdf' | 'docx', date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  const safeCode = code.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-')
  return `syllabus-${safeCode || 'report'}-${stamp}.${ext}`
}