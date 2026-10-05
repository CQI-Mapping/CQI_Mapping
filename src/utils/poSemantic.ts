// poSemantic: frontend-only TensorFlow.js semantic ranking for closest-PO.
//
// Uses the Universal Sentence Encoder (USE) from tensorflow.org — no API keys,
// no server, no quota. Model weights load once from CDN on first use, then are
// cached in memory. Embeddings are cached per PO-list hash so re-typing only
// re-embeds the draft, not the whole PO corpus.
//
// Returns null when the model cannot load (offline / blocked CDN / timeout)
// so callers fall back to the keyword matcher in poMatch.ts.

import type { PoText, RankedPo } from './poMatch'

export type SemanticEngine = 'use-embeddings' | 'unavailable'

interface UseEmbedResult {
  array: () => Promise<number[][]>
  dispose?: () => void
}

interface UseModel {
  embed: (inputs: string[]) => UseEmbedResult
}

let modelPromise: Promise<UseModel | null> | null = null
const poCache = new Map<string, { vectors: number[][]; codes: string[] }>()

function loadModel(): Promise<UseModel | null> {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const mod = await import('@tensorflow-models/universal-sentence-encoder')
        const loader = (mod as unknown as { load?: () => Promise<UseModel> }).load
        if (typeof loader !== 'function') return null
        return await loader()
      } catch {
        return null
      }
    })()
  }
  return modelPromise
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
  return `${po.code} ${po.title ?? ''} ${po.description ?? ''}`.trim().slice(0, 256)
}

function cacheKey(pos: PoText[]): string {
  return pos.map((p) => `${p.code}|${p.title ?? ''}|${p.description ?? ''}`).join('\n')
}

export async function rankSemantic(
  draft: string,
  pos: PoText[],
  top = 3,
): Promise<{ ranked: RankedPo[]; engine: SemanticEngine } | null> {
  const clean = draft.trim()
  if (!clean || pos.length === 0) return null
  const model = await withTimeout(loadModel(), 8000)
  if (!model) return null
  try {
    const key = cacheKey(pos)
    let cached = poCache.get(key)
    if (!cached || cached.codes.join() !== pos.map((p) => p.code).join()) {
      const poTexts = pos.map(poTextOf)
      const emb = await withTimeout(model.embed(poTexts).array(), 8000)
      if (!emb) return null
      cached = { vectors: emb.slice(0), codes: pos.map((p) => p.code) }
      poCache.set(key, cached)
      if (poCache.size > 5) {
        const first = poCache.keys().next().value
        if (first) poCache.delete(first)
      }
    }
    const draftEmb = await withTimeout(model.embed([clean.slice(0, 256)]).array(), 8000)
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
      .filter((r): r is RankedPo => r !== null && r.score >= 30)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
      .slice(0, top)
    return { ranked: scored, engine: 'use-embeddings' }
  } catch {
    return null
  }
}
