// The Overall Report's PDF, as data.
//
// The page computes everything its panels show -- KPI tiles, the course
// mapping rows, the coverage chart, the CLO-to-PO links, the alignment mixes,
// the gaps, and the CQI actions. This interface is that result, in the shape
// the document draws.
//
// Splitting the model from the renderer is what lets utils/reportsPdf.ts stay
// pure with respect to jsPDF, and keeps the page (which already holds every
// number, memoised) the single author of what the PDF says. The document
// cannot drift from the screen it was made on because the screen's numbers and
// the document's are the same object.

export interface ReportKpi {
  /** The card's label, matching the page's KPI tile. */
  label: string
  /** The figure as it should be printed, already formatted ('248', '82%'). */
  value: string
  /** The qualifier that makes the figure mean something. */
  sub: string
  /** 'good' and 'warn' tint the card's accent strip; anything else is neutral. */
  tone?: 'good' | 'warn'
}

/** A course's mapping status, the same four words the page's badges use. */
export type MappingStatus = 'Mapped' | 'Partially Mapped' | 'Unmapped' | 'No CLOs'

export interface ReportsPdfModel {
  meta: {
    /** The institute line, e.g. "INSTITUTE FOR COMPUTER STUDIES". */
    institute: string
    /** The department line, e.g. "BSIT Department". */
    department: string
    /** The strap line, one string per line, in the masthead's top right. */
    tagline: string[]
    academicYear: string
    /** The program as the banner names it, name and code together. */
    program: string
    /** The semester context ("1" or "2"), shown when the report carries one. */
    semester?: string
    generated: string
    /** An identifier for this export, stable for a day: "CQI-OVR-2026-1017". */
    reportId: string
    source: string
  }
  /** The eight tiles, in the order the page lays them out. */
  kpis: ReportKpi[]
  mapping: {
    rows: { code: string; title: string; year: string; semester: string; clos: number; status: MappingStatus }[]
  }
  poCoverage: {
    rows: { label: string; percent: number; count: number }[]
    /** Outcomes with no mapped CLOs, excluded from the chart by the page. */
    uncovered: number
    /** Further covered outcomes past the chart's cut. */
    hidden: number
    totalClos: number
  }
  matrix: {
    columns: { key: string; label: string }[]
    rows: { label: string; hits: number[] }[]
    unmappedCount: number
  }
  mix: {
    centerValue: number
    centerLabel: string
    /** One slice per anchor family the mapped outcomes reach. */
    slices: { label: string; count: number; rgb: [number, number, number] }[]
  }
  gaps: {
    unmappedClos: { course: string; text: string }[]
    unreachedPos: { code: string; title: string }[]
  }
  cqi: {
    /** True when the database has no cqi_actions table at all. */
    missing: boolean
    rows: { code: string; recommendation: string; responsible: string; status: string; target: string | null }[]
  }
  /** Key findings, one sentence each, drawn from the report's own numbers. */
  findings: string[]
  /** Recommendations, numbered as acted-on advice, also from those numbers. */
  recommendations: string[]
  signatures: {
    preparedName: string
    preparedRole: string
    date: string
  }
}
