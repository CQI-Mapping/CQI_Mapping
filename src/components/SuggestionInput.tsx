// Google-style autocomplete input: as the user types, a dropdown of
// matching options appears. Selecting one fills the input. Single-select only.

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

  const q = query.trim().toLowerCase()
  // When empty and focused, show the pre-filtered BSIT CMO-25 POs (for CLO page)
  // otherwise require 2 chars to filter — keeps dropdown useful while respecting
  // the "ONLY IF THERE IS NO INPUT" rule from the user.
  const visibleOptions = q.length >= 2
    ? options.filter((o) => (o.label ?? o.value).toLowerCase().includes(q))
    : q.length === 0 && open
      ? options.slice(0, 12)
      : []

  const select = (o: SuggestionOption) => {
    onChange(o.value)
    setQuery(o.value)
    setOpen(false)
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
        onChange={(e) => { const v = e.target.value; setQuery(v); const t = v.trim(); setOpen(t.length === 0 || t.length >= 2); }}
        onFocus={() => { const t = query.trim(); if (t.length === 0 || t.length >= 2) setOpen(true) }}
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