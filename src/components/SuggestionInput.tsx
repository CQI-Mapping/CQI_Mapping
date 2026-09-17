// Google-style autocomplete input: as the user types, a dropdown of
// matching options appears. Supports comma-separated multi-values (e.g. PEO
// Alignment "PEO-1, PEO-2") — the keyword is "," and suggestions follow the
// last token after the last comma.

import { useEffect, useRef, useState } from 'react'

export interface SuggestionOption {
  value: string
  label?: string
}

interface SuggestionInputProps {
  value: string
  onChange: (value: string) => void
  options: SuggestionOption[]
  placeholder?: string
}

export default function SuggestionInput({ value, onChange, options, placeholder }: SuggestionInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => setActive(0), [query])

  // Follow the active item when user navigates with arrows (keyboard) — keeps it visible.
  useEffect(() => {
    if (!open) return
    const el = ref.current?.querySelector('.suggestion__item--active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  // Multi-value support: keyword is "," — filter on the last comma-separated token.
  const lastToken = query.split(',').pop()?.trim() ?? ''
  const lastTokenLower = lastToken.toLowerCase()
  // Exclude already-selected tokens from suggestions
  const selectedSet = new Set(
    query.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s && s !== lastTokenLower)
  )
  const visibleOptions = lastTokenLower.length >= 2
    ? options.filter((o) => {
        const key = (o.label ?? o.value).toLowerCase()
        if (selectedSet.has(o.value.toLowerCase())) return false
        return key.includes(lastTokenLower)
      })
    : []

  const select = (o: SuggestionOption) => {
    const parts = query.split(',')
    parts[parts.length - 1] = ` ${o.value}` // keep comma separation
    const next = parts.map((s) => s.trim()).filter(Boolean).join(', ')
    onChange(next)
    setQuery(next)
    setOpen(false)
  }

  const shouldOpen = (v: string) => {
    const tok = v.split(',').pop()?.trim() ?? ''
    return tok.length >= 2
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, visibleOptions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' && visibleOptions[active]) {
      e.preventDefault()
      select(visibleOptions[active])
    }
  }

  return (
    <div className="suggestion" ref={ref}>
      <input
        className="input input--sm suggestion__input"
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(shouldOpen(e.target.value)); }}
        onFocus={() => { if (shouldOpen(query)) setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="suggestion__list">
          {visibleOptions.length === 0 && <div className="suggestion__empty">No matches</div>}
          {visibleOptions.map((o, i) => (
            <button type="button" key={o.value} className={`suggestion__item ${i === active ? 'suggestion__item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); select(o) }}
              onMouseEnter={() => setActive(i)}>
              {o.label ?? o.value}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}