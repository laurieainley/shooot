import { useEffect, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { parseRoster, sortNames } from '../utils/roster'
import { solidTeamColor } from '../utils/teamColor'
import { suggestPlayers, type KnownPlayer } from '../utils/knownPlayers'

interface RosterTagsProps {
    /** Accessible name of the add field, e.g. "Team 1 roster". */
    label: string
    names: string[]
    onChange: (names: string[]) => void
    /** Players remembered on this device, suggested while typing. */
    known?: KnownPlayer[]
    /** Names already in a team (any team): never suggested. */
    exclude?: string[]
    /** Remove a name from the remembered players. */
    onForget?: (name: string) => void
    /** The team's kit colour, for the little shirt beside each player. */
    color?: string
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
const isEnter = (e: KeyboardEvent<HTMLInputElement>): boolean =>
    e.key === 'Enter' || e.keyCode === 13 || e.which === 13 // some Android keyboards report key "Unidentified"

function Cross() {
    return (
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
            <path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    )
}

/** A mini shirt in the kit colour; the outline keeps a white kit visible on a light background. */
function Shirt({ color }: { color: string }) {
    return (
        <svg className="roster-shirt" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path fill={color} stroke="var(--sh-muted)" strokeWidth="1.2" strokeLinejoin="round"
                d="M8.5 3.5 3 6.2l1.8 4.6 2.7-1V20.5h9V9.8l2.7 1L21 6.2l-5.5-2.7c-.5 1.4-1.8 2.2-3.5 2.2s-3-.8-3.5-2.2z" />
        </svg>
    )
}

/**
 * A roster, laid out as a lineup: a field with an Add button (only Enter or the Add button adds; a name typed and left in the field stays there as a draft; pasting several names adds several; Enter keeps
 * focus in the field so the next name can be typed), previous players suggested under it, and the roster as chips
 * below, one player per line with a shirt in the team colour (click a name to fix it, × to remove it). Names are de-duplicated ignoring case.
 */
export function RosterTags({ label, names: unsorted, onChange: emit, known = [], exclude = [], onForget, color }: RosterTagsProps) {
    const names = sortNames(unsorted)
    const onChange = (next: string[]): void => emit(sortNames(next))
    const [draft, setDraft] = useState('')
    const [focused, setFocused] = useState(false)
    const [typing, setTyping] = useState(false)
    const [editing, setEditing] = useState<number | null>(null)
    const [editText, setEditText] = useState('')
    const inputRef = useRef<HTMLInputElement | null>(null)
    const entryRef = useRef<HTMLDivElement | null>(null)
    const suggestRef = useRef<HTMLDivElement | null>(null)

    const add = (text: string): void => {
        const added = parseRoster(text).filter((n) => !names.some((x) => same(x, n)))
        if (added.length) onChange([...names, ...added])
    }
    const commitDraft = (): void => { if (draft.trim()) add(draft); setDraft('') }
    /** Add what is typed and stay in the field (the keyboard stays up on phones). */
    const commitAndStay = (): void => { commitDraft(); inputRef.current?.focus() }

    // A line break that reaches the field as text input (some Android keyboards) is an Enter too. React has no
    // synthetic beforeinput with inputType, so listen natively; the ref always holds the latest handler.
    const lineBreak = useRef(commitAndStay)
    lineBreak.current = commitAndStay
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        const handler = (e: Event): void => {
            if ((e as InputEvent).inputType !== 'insertLineBreak') return
            e.preventDefault()
            lineBreak.current()
        }
        el.addEventListener('beforeinput', handler)
        return () => el.removeEventListener('beforeinput', handler)
    }, [])

    const suggestions = focused ? suggestPlayers(known, draft, [...exclude, ...names], 6) : []

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (isEnter(e)) {
            e.preventDefault()
            commitAndStay()
        } else if (e.key === 'ArrowDown' && suggestions.length) {
            e.preventDefault()
            suggestRef.current?.querySelector<HTMLButtonElement>('.roster-suggest__name')?.focus()
        }
    }
    const onChangeDraft = (value: string): void => {
        if (/\n/.test(value)) { add(value); setDraft(''); return } // keyboards that put the line break in the text
        setDraft(value)
    }
    const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
        const text = e.clipboardData.getData('text')
        if (!/[\n,]/.test(text)) return
        e.preventDefault()
        add(`${draft}\n${text}`)
        setDraft('')
    }
    const onInputFocus = (): void => {
        entryRef.current?.scrollIntoView?.({ block: 'center', behavior: matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }

    const pick = (name: string): void => {
        add(name)
        setDraft('')
        inputRef.current?.focus()
    }
    const onSuggestKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        const buttons = [...(suggestRef.current?.querySelectorAll<HTMLButtonElement>('.roster-suggest__name') ?? [])]
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation()
            inputRef.current?.focus()
        } else if (i >= 0 && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
            e.preventDefault()
            buttons[Math.min(i + 1, buttons.length - 1)]?.focus()
        } else if (i >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
            e.preventDefault()
            if (i === 0) inputRef.current?.focus()
            else buttons[i - 1]?.focus()
        }
    }
    const onEntryBlur = (e: FocusEvent<HTMLDivElement>): void => {
        if (!entryRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false)
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
        <div className="roster">
            <div ref={entryRef} className="roster__entry" onFocus={() => setFocused(true)} onBlur={onEntryBlur}>
                <div className="roster__row">
                    <input
                        ref={inputRef}
                        aria-label={label}
                        value={draft}
                        placeholder={names.length ? 'Add a player' : 'Type a name, or paste a list'}
                        enterKeyHint="enter"
                        autoCapitalize="words"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => onChangeDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        onFocus={() => { setTyping(true); onInputFocus() }}
                        onBlur={() => setTyping(false)}
                        className="field roster__input"
                    />
                    <button
                        type="button"
                        className="btn-quiet roster__add"
                        disabled={!draft.trim()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={commitAndStay}
                    >Add</button>
                </div>
                {/* Leaving the field never adds (user decision): say so, so a typed name isn't lost on Next / Done. */}
                {!typing && draft.trim() && <p role="status" className="roster__unadded">{draft.trim()} isn’t added yet: press Enter or Add.</p>}
                {suggestions.length > 0 && (
                    <div ref={suggestRef} role="group" aria-label="Previous players" data-owns-escape className="roster-suggest" onKeyDown={onSuggestKeyDown}>
                        <span className="roster-suggest__title" aria-hidden="true">Previous players</span>
                        {suggestions.map((name) => (
                            <span key={name.toLowerCase()} className="roster-tag roster-suggest__chip">
                                <button
                                    type="button"
                                    className="roster-tag__name roster-suggest__name"
                                    aria-label={`Add ${name}`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pick(name)}
                                >{name}</button>
                                {onForget && (
                                    <button
                                        type="button"
                                        className="roster-tag__remove"
                                        aria-label={`Forget ${name}`}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => { onForget(name); inputRef.current?.focus() }}
                                    ><Cross /></button>
                                )}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            {names.length > 0 && (
                <>
                <p className="roster__count">{names.length === 1 ? '1 player' : `${names.length} players`}</p>
                <ul className="roster__list" aria-label={`${label} players`}>
                    {names.map((name, i) => (
                        <li key={name.toLowerCase()} className="roster-player">
                            <Shirt color={solidTeamColor(color, 'var(--sh-surface-2)')} />
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
                                <Cross />
                            </button>
                        </li>
                    ))}
                </ul>
                </>
            )}
        </div>
    )
}
