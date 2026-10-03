import { useEffect, useState } from 'react'
import { formatHMS, parseTimeToSeconds } from '../utils/timeline'

interface TimeInputProps {
    valueSec: number
    onCommit: (seconds: number) => void
    className?: string
    ariaLabel?: string
}

export function TimeInput({ valueSec, onCommit, className, ariaLabel }: TimeInputProps) {
    const [text, setText] = useState(formatHMS(valueSec))
    const [lastValid, setLastValid] = useState(formatHMS(valueSec))

    useEffect(() => {
        const next = formatHMS(valueSec)
        setText(next)
        setLastValid(next)
    }, [valueSec])

    const tryCommit = () => {
        const parsed = parseTimeToSeconds(text)
        if (parsed != null) {
            onCommit(parsed)
            const norm = formatHMS(parsed)
            setText(norm)
            setLastValid(norm)
        } else {
            setText(lastValid)
        }
    }

    return (
        <input
            aria-label={ariaLabel}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={tryCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') { setText(lastValid); e.currentTarget.blur() }
            }}
            className={className ?? 'w-[65px] rounded bg-deep border border-border px-2 py-1 text-sm text-light focus:border-pink focus:outline-none'}
        />
    )
}
