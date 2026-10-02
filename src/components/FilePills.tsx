import { useRef, useState } from 'react'
import { useAppState } from '../state'
import { processVideoFiles } from '../utils/processFiles'

function formatMSS(s: number): string {
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${Math.floor(s % 60)}`.padStart(2, '0')
    return `${mm}:${ss}`
}

export function FilePills() {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const files = useAppState((s) => s.files)
    const setFiles = useAppState((s) => s.setFiles)
    const removeFile = useAppState((s) => s.removeFile)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const [message, setMessage] = useState<string | null>(null)

    const onPick = async (evt: React.ChangeEvent<HTMLInputElement>) => {
        const list = evt.target.files
        if (!list || list.length === 0) return
        const result = await processVideoFiles(list)
        if (result.error) setMessage(result.error)
        if (result.files.length > 0) setFiles(result.files)
    }

    const move = (from: number, to: number) => {
        if (to < 0 || to >= files.length) return
        const next = files.slice()
        const [it] = next.splice(from, 1)
        next.splice(to, 0, it)
        setFiles(next)
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {files.map((f, i) => (
                <div
                    key={f.id}
                    onClick={() => setCurrentFileIndex(i)}
                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold cursor-pointer border transition-colors ${
                        i === currentFileIndex
                            ? 'bg-surface border-pink text-light'
                            : 'bg-surface border-border text-muted hover:border-pink/50'
                    }`}
                >
                    <span className={i === currentFileIndex ? 'text-light' : 'text-muted'}>
                        {f.name}
                    </span>
                    {f.durationSec != null && (
                        <span className="text-xs text-muted">{formatMSS(f.durationSec)}</span>
                    )}
                    {files.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); move(i, i - 1) }}
                                disabled={i === 0}
                                className="text-xs text-muted hover:text-light disabled:opacity-30 bg-transparent border-none p-0 cursor-pointer"
                            >↑</button>
                            <button
                                onClick={(e) => { e.stopPropagation(); move(i, i + 1) }}
                                disabled={i === files.length - 1}
                                className="text-xs text-muted hover:text-light disabled:opacity-30 bg-transparent border-none p-0 cursor-pointer"
                            >↓</button>
                        </>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        className="text-xs text-pink/50 hover:text-pink bg-transparent border-none p-0 cursor-pointer"
                    >×</button>
                </div>
            ))}
            <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1 rounded px-3 py-1.5 text-sm border border-dashed border-yellow/30 bg-yellow/5 text-yellow/60 hover:border-yellow/60 hover:text-yellow cursor-pointer transition-colors"
            >
                + Add file
            </button>
            <input
                ref={inputRef}
                type="file"
                multiple
                onChange={onPick}
                className="hidden"
            />
            {message && <p className="text-sm text-pink">{message}</p>}
        </div>
    )
}
