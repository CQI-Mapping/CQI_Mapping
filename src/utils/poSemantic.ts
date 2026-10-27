// poSemantic: frontend-only semantic ranking for closest-PO.
//
// Premium engine: all-mpnet-base-v2 (110M params, 768-dim) run in-browser by
// Transformers.js v4 (@huggingface/transformers) — WebGPU where available,
// WASM otherwise. Free, open-source: no API keys, no server, no quota.
// Model weights (~110 MB quantized) download once from the CDN on first use
// and are cached by the browser forever after; PO embeddings are cached per
// PO-list hash so re-typing only re-embeds the draft, not the whole corpus.
//
// Returns null when the model cannot load (offline / blocked CDN / timeout)
// so callers fall back to the keyword matcher in poMatch.ts — the suggest
// strip is never blank. Load progress is broadcast via subscribeSemantic()
// so the suggestion strip can show a download % line while the model lands.

import type { PoText, RankedPo } from './poMatch'

export type SemanticEngine = 'mpnet' | 'unavailable'

const MODEL_ID = 'Xenova/all-mpnet-base-v2'

// MPNet cosine gate, measured on the official corpus (calibration probe,
// 2026-10-28): exact drafts land 58–87, true paraphrases 44–85, gibberish
// noise tops out at 19. 35 sits between the noise ceiling and the weakest
// useful paraphrase, keeping precision while letting paraphrases through.
const SEM_GATE = 35

// First load pulls ~110 MB — give it a real window (the UI shows download
// progress). Re-loads hit the browser cache and finish in about a second.
const LOAD_TIMEOUT_MS = 90_000
const INFER_TIMEOUT_MS = 12_000

interface EmbedExtractor {
  (inputs: string | string[], options?: Record<string, unknown>): Promise<{ tolist: () => number[][] | number[] }>
}

// ── Load state (drives the suggestion strip's progress line) ─────────────

export interface SemanticLoadState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** 0-100 download progress while loading. */
  progress: number
}

let loadState: SemanticLoadState = { status: 'idle', progress: 0 }
const stateListeners = new Set<(s: SemanticLoadState) => void>()
// The model's progress_callback fires many times per percent — only notify
// listeners when the rounded percent actually changes.
let lastProgress = -1

function setState(next: SemanticLoadState): void {
  if (next.status === 'loading' && next.progress === lastProgress) return
  if (next.status === 'loading') lastProgress = next.progress
  else lastProgress = -1
  loadState = next
  for (const cb of stateListeners) {
    try { cb(next) } catch { /* listener errors never break loading */ }
  }
}

/** Subscribe to model load progress (download %, ready/unavailable). */
export function subscribeSemantic(cb: (s: SemanticLoadState) => void): () => void {
  stateListeners.add(cb)
  cb(loadState)
  return () => { stateListeners.delete(cb) }
}

/** Kick off the model download in the background (e.g. on page mount). */
export function preloadSemantic(): void {
  void loadExtractor()
}

let extractorPromise: Promise<EmbedExtractor | null> | null = null
// When a load fails (offline / blocked CDN), back off before retrying so
// every keystroke doesn't hammer the CDN; the next attempt happens after
// this window and silently falls back to keywords until it succeeds.
let failedAt = 0
const RETRY_BACKOFF_MS = 60_000

const poCache = new Map<string, { vectors: number[][]; codes: string[] }>()

function loadExtractor(): Promise<EmbedExtractor | null> {
  if (!extractorPromise) {
    if (failedAt && Date.now() - failedAt < RETRY_BACKOFF_MS) return Promise.resolve(null)
    setState({ status: 'loading', progress: 0 })
    extractorPromise = (async () => {
      try {
        const mod = await import('@huggingface/transformers')
        const pipeline = (mod as unknown as { pipeline?: unknown }).pipeline
        if (typeof pipeline !== 'function') {
          setState({ status: 'unavailable', progress: 0 })
          return null
        }
        const pipe = pipeline as (
          task: string,
          model: string,
          options?: { progress_callback?: (p: { status: string; progress?: number }) => void },
        ) => Promise<EmbedExtractor>
        const extractor = await pipe('feature-extraction', MODEL_ID, {
          progress_callback: (p) => {
            if (p.status === 'progress' && typeof p.progress === 'number') {
              setState({ status: 'loading', progress: Math.min(100, Math.round(p.progress)) })
            }
          },
        })
        setState({ status: 'ready', progress: 100 })
        return extractor
      } catch {
        failedAt = Date.now()
        setState({ status: 'unavailable', progress: 0 })
        return null
      }
    })()
    // A failed load clears the handle so a later call can retry (the
    // RETRY_BACKOFF_MS guard above throttles how often that happens).
    extractorPromise.then((v) => { if (v === null) extractorPromise = null })
  }
  return extractorPromise
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      () => { clearTimeout(t); resolve(null) },
    )
  })
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function poTextOf(po: PoText): string {
  return `${po.code} ${po.title ?? ''} ${po.description ?? ''} ${po.extra ?? ''}`.trim().slice(0, 512)
}

function cacheKey(pos: PoText[]): string {
  return pos.map((p) => `${p.code}|${p.title ?? ''}|${p.description ?? ''}|${p.extra ?? ''}`).join('\n')
}

function toMatrix(raw: number[][] | number[], rows: number): number[][] | null {
  if (rows === 1 && !Array.isArray(raw[0])) return [raw as number[]]
  if (Array.isArray(raw[0])) return raw as number[][]
  return null
}

export async function rankSemantic(
  draft: string,
  pos: PoText[],
  top = 3,
): Promise<{ ranked: RankedPo[]; engine: SemanticEngine } | null> {
  const clean = draft.trim()
  if (!clean || pos.length === 0) return null
  const extractor = await withTimeout(loadExtractor(), LOAD_TIMEOUT_MS)
  if (!extractor) return null
  try {
    const key = cacheKey(pos)
    let cached = poCache.get(key)
    if (!cached || cached.codes.join() !== pos.map((p) => p.code).join()) {
      const raw = await withTimeout(
        extractor(pos.map(poTextOf), { pooling: 'mean', normalize: true }).then((t) => t.tolist()),
        INFER_TIMEOUT_MS,
      )
      const emb = raw ? toMatrix(raw, pos.length) : null
      if (!emb || emb.length !== pos.length) return null
      cached = { vectors: emb.slice(0), codes: pos.map((p) => p.code) }
      poCache.set(key, cached)
      if (poCache.size > 5) {
        const first = poCache.keys().next().value
        if (first) poCache.delete(first)
      }
    }
    const rawDraft = await withTimeout(
      extractor(clean.slice(0, 256), { pooling: 'mean', normalize: true }).then((t) => t.tolist()),
      INFER_TIMEOUT_MS,
    )
    const draftEmb = rawDraft ? toMatrix(rawDraft, 1) : null
    if (!draftEmb || !draftEmb[0]) return null
    const head = draftEmb[0]
    const scored = pos
      .map((po, i) => {
        const v = cached!.vectors[i]
        if (!v) return null
        const score = Math.round(cosine(head, v) * 100)
        const label = `${po.code} - ${po.title ?? ''}`.trim()
        return { code: po.code, label, score, matched: [] as string[] }
      })
      .filter((r): r is RankedPo => r !== null && r.score >= SEM_GATE)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
      .slice(0, top)
    if (scored.length === 0) return null
    return { ranked: scored, engine: 'mpnet' }
  } catch {
    return null
  }
}
