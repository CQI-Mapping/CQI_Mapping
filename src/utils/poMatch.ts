// Closest-PO matcher: ranks Program Outcomes by word overlap with a CLO description draft.
//
// Pure local string matching — no AI keys, no network, no TF dependency.
// Score = Jaccard token overlap between draft and "PO code + title + description",
// with a small bonus for covering more of the draft's keywords.

export interface PoText {
  code: string
  title: string | null
  description?: string | null
  /** Enriched alignment text (PEO/SG/CMO) so thin POs still match. */
  extra?: string | null
}

export interface RankedPo {
  code: string
  label: string
  score: number // 0-100
  matched: string[]
}

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by',
  'be', 'is', 'are', 'was', 'were', 'will', 'shall', 'can', 'able', 'that',
  'this', 'these', 'those', 'it', 'its', 'as', 'at', 'from', 'into', 'out',
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

function stem(t: string): string {
  // Tiny suffix strip so "programming/programs" and "systems/system" still match.
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3)
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2)
  if (t.length > 4 && t.endsWith('s')) return t.slice(0, -1)
  return t
}

// Verb stems split by spelling: "create" vs "creating"→"creat". Folding a
// trailing "e" makes both spellings meet at one token, so drafts in either
// form ("create" / "creating" / "creat-") match the outcome text.
function foldE(t: string): string {
  return t.length > 4 && t.endsWith('e') ? t.slice(0, -1) : t
}

/** Full normalization used for map keys and tokens: stem, then fold e. */
function norm(t: string): string {
  return foldE(stem(t))
}

function tokenSet(s: string): Set<string> {
  return new Set(tokens(s).map((t) => canonical(t)))
}

// Offline curriculum synonym groups — canonical head is the first entry.
// Lets "build apps" match "develop software" with zero shared raw words.
// Expanded to ~40 groups covering the CMO 25 s. 2015 outcome vocabulary
// (utilize/uphold/impact/project-plan/integrate/…), so the keyword floor —
// the path that runs before (or without) the semantic model — still lands
// the draft in the right outcome family.
const SYN_GROUPS: string[][] = [
  ['develop', 'build', 'create', 'construct', 'implement'],
  ['software', 'app', 'application', 'program', 'system', 'website', 'web', 'mobile', 'platform', 'dashboard', 'online'],
  ['design', 'plan', 'architect', 'model'],
  ['evaluate', 'test', 'assess', 'validate', 'measure'],
  ['analyze', 'compare', 'contrast', 'examine', 'investigate'],
  ['manage', 'maintain', 'administer', 'operate', 'administration', 'management', 'administrative'],
  ['data', 'database', 'information', 'dataset'],
  ['network', 'infrastructure', 'server'],
  ['security', 'protect', 'secure', 'safety'],
  ['solve', 'resolve', 'troubleshoot', 'debug'],
  ['communicate', 'present', 'report', 'document', 'write'],
  ['team', 'collaborate', 'cooperate', 'group'],
  ['ethic', 'ethical', 'professional', 'responsibility', 'responsibilty', 'conduct'],
  ['learn', 'study', 'understand', 'demonstrate'],
  // ── Premium expansion: CMO 25 s. 2015 vocabulary ──────────────────────
  ['utilize', 'use', 'used', 'employ', 'leverage', 'harness', 'utilized', 'utilization', 'usage'],
  ['uphold', 'observe', 'observed', 'adhere', 'follow', 'comply', 'compliance'],
  ['need', 'requirement', 'demand', 'necessity', 'required'],
  ['impact', 'affect', 'affected', 'influence', 'effect'],
  ['society', 'social', 'community', 'communities', 'public', 'societal'],
  ['global', 'local', 'worldwide', 'international'],
  ['organization', 'business', 'enterprise', 'company', 'industry', 'firm'],
  ['user', 'individual', 'stakeholder', 'client', 'customer', 'people'],
  ['project', 'roadmap', 'milestone', 'schedule', 'deliverable'],
  ['leader', 'leadership', 'member', 'role'],
  ['goal', 'objective', 'mission', 'vision', 'purpose'],
  ['technique', 'method', 'approach', 'methodology'],
  ['tool', 'equipment', 'instrument', 'tooling'],
  ['knowledge', 'expertise', 'competence', 'competency'],
  ['mathematic', 'math', 'science', 'scientific'],
  ['complex', 'complicated', 'intricate'],
  ['problem', 'issue', 'challenge', 'task'],
  ['modern', 'current', 'latest', 'contemporary'],
  ['select', 'choose', 'pick', 'choice', 'selection', 'selected'],
  ['process', 'procedure', 'workflow', 'pipeline'],
  ['component', 'module', 'element', 'unit'],
  ['constraint', 'limitation', 'restriction', 'limit'],
  ['integrate', 'integrated', 'integration', 'incorporate', 'embed', 'deploy', 'deployed', 'deployment'],
  ['assist', 'support', 'help', 'aid'],
  ['recognize', 'recognized', 'identify', 'identified', 'determine', 'detect'],
  ['performance', 'efficiency', 'productivity', 'speed', 'improve', 'improved'],
  ['self', 'personal', 'own'],
]

const SYN_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>()
  // Keys and heads are normalized the same way tokens are, so "create" and
  // "creating" land on the same map entry no matter which spelling arrives.
  for (const g of SYN_GROUPS) for (const w of g) m.set(norm(w), norm(g[0]))
  return m
})()

function canonical(t: string): string {
  return SYN_MAP.get(norm(t)) ?? norm(t)
}

export function scorePo(draft: string, po: PoText): { score: number; matched: string[] } {
  const d = tokenSet(draft)
  if (d.size === 0) return { score: 0, matched: [] }
  const p = tokenSet(`${po.code} ${po.title ?? ''} ${po.description ?? ''} ${po.extra ?? ''}`)
  if (p.size === 0) return { score: 0, matched: [] }
  const matched: string[] = []
  for (const t of d) if (p.has(t)) matched.push(t)
  if (matched.length === 0) return { score: 0, matched: [] }
  const union = new Set([...d, ...p])
  const jaccard = matched.length / union.size
  const coverage = matched.length / d.size // how much of the draft is covered
  const score = Math.round((jaccard * 0.6 + coverage * 0.4) * 100)
  return { score, matched }
}

export function rankClosestPos(draft: string, pos: PoText[], top = 3): RankedPo[] {
  if (!draft.trim() || pos.length === 0) return []
  const ranked = pos
    .map((po) => {
      const { score, matched } = scorePo(draft, po)
      const label = `${po.code} - ${po.title ?? ''}`.trim()
      return { code: po.code, label, score, matched }
    })
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
  // Always suggest: return best top-N even when nothing overlaps (score 0).
  // Callers treat top score 0 as low confidence.
  return ranked.slice(0, top)
}
