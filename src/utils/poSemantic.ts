// poSemantic: frontend-only MiniLM semantic ranking for closest-PO.
//
// Uses Transformers.js MiniLM-L6-v2 (free, open-source, in-browser ONNX/WASM)
// — no API keys, no server, no quota. Model weights load once from CDN on
// first use, then embeddings are cached per PO-list hash so re-typing only
// re-embeds the draft, not the whole PO corpus.
//
// Returns null when the model cannot load (offline / blocked CDN / timeout)
// so callers fall back to the keyword matcher in poMatch.ts.

import type { PoText, RankedPo } from './poMatch'

export type SemanticEngine = 'minilm' | 'unavailable'

// MiniLM cosine gate, calibrated against the probe set in poMatch.test.ts:
// MiniLM scores paraphrases higher than USE, so 35 keeps precision while
// letting true paraphrases through.
const SEM_GATE = 35

interface MiniLMExtractor {
  (inputs: string | string[], options?: Record<string, unknown>): Promise<{ tolist: () => number[][] | number[] }>
}

let extractorPromise: Promise<MiniLMExtractor | null> | null = null
const poCache = new Map<string, { vectors: number[][]; codes: string[] }>()

function loadExtractor(): Promise<MiniLMExtractor | null> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        const mod = await import('@xenova/transformers')
        const pipeline = (mod as unknown as { pipeline?: unknown }).pipeline
        if (typeof pipeline !== 'function') return null
        const pipe = pipeline as (task: string, model: string) => Promise<MiniLMExtractor>
        return await pipe('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
      } catch {
        return null
      }
    })()
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
  const extractor = await withTimeout(loadExtractor(), 12000)
  if (!extractor) return null
  try {
    const key = cacheKey(pos)
    let cached = poCache.get(key)
    if (!cached || cached.codes.join() !== pos.map((p) => p.code).join()) {
      const raw = await withTimeout(
        extractor(pos.map(poTextOf), { pooling: 'mean', normalize: true }).then((t) => t.tolist()),
        12000,
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
      12000,
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
    return { ranked: scored, engine: 'minilm' }
  } catch {
    return null
  }
}
