import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { parseRoster, sortNames } from '../utils/roster'

interface RosterTagsProps {
    /** Accessible name of the add field, e.g. "Team 1 roster". */
    label: string
    names: string[]
    onChange: (names: string[]) => void
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/**
 * A roster as tags: type a name and press Enter, comma or Tab to add it (pasting several names adds several),
 * click a name to fix it, × to remove it. Names are de-duplicated ignoring case.
 */
export function RosterTags({ label, names: unsorted, onChange: emit }: RosterTagsProps) {
    const names = sortNames(unsorted)
    const onChange = (next: string[]): void => emit(sortNames(next))
    const [draft, setDraft] = useState('')
    const [editing, setEditing] = useState<number | null>(null)
    const [editText, setEditText] = useState('')
    const inputRef = useRef<HTMLInputElement | null>(null)

    const add = (text: string): void => {
        const added = parseRoster(text).filter((n) => !names.some((x) => same(x, n)))
        if (added.length) onChange([...names, ...added])
    }
    const commitDraft = (): void => { if (draft.trim()) add(draft); setDraft('') }

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commitDraft()
        } else if (e.key === 'Tab' && !e.shiftKey && draft.trim()) {
            commitDraft() // focus moves on as normal
        } else if (e.key === 'Backspace' && !draft && names.length) {
            onChange(names.slice(0, -1))
        }
    }
    const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
        const text = e.clipboardData.getData('text')
        if (!/[\n,]/.test(text)) return
        e.preventDefault()
        add(`${draft}\n${text}`)
        setDraft('')
    }

    const startEdit = (i: number): void => { setEditing(i); setEditText(names[i]) }
    const saveEdit = (): void => {
        if (editing === null) return
        const i = editing
        const next = editText.trim().replace(/\s+/g, ' ')
        setEditing(null)
        if (!next || next === names[i]) return
        if (names.some((x, j) => j !== i && same(x, next))) return // would duplicate another player: keep the old name
        onChange(names.map((x, j) => (j === i ? next : x)))
    }

    return (
        <div className="roster-tags" onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus() }}>
            {names.map((name, i) => (
                <span key={name.toLowerCase()} className="roster-tag">
                    {editing === i ? (
                        <input
                            autoFocus
                            aria-label={`Edit ${name}`}
                            value={editText}
                            size={Math.max(4, editText.length + 1)}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null) }
                            }}
                            data-owns-escape
                            className="roster-tag__edit"
                        />
                    ) : (
                        <button type="button" className="roster-tag__name" title="Click to edit" aria-label={`Edit ${name}`} onClick={() => startEdit(i)}>{name}</button>
                    )}
                    <button type="button" className="roster-tag__remove" aria-label={`Remove ${name}`} onClick={() => onChange(names.filter((_, j) => j !== i))}>
                        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
                            <path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                </span>
            ))}
            <input
                ref={inputRef}
                aria-label={label}
                value={draft}
                placeholder={names.length ? 'Add player' : 'Type a name, press Enter, or paste a list'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onBlur={commitDraft}
                className="roster-tags__input"
            />
        </div>
    )
}
