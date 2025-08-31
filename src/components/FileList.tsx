import { useAppState } from '../state'

export function FileList() {
    const files = useAppState((s) => s.files)
    const setFiles = useAppState((s) => s.setFiles)

    const move = (from: number, to: number) => {
        if (to < 0 || to >= files.length) return
        const next = files.slice()
        const [it] = next.splice(from, 1)
        next.splice(to, 0, it)
        setFiles(next)
    }

    if (files.length === 0) return <p>No files loaded.</p>

    return (
        <div>
            <h3>Files</h3>
            <ol>
                {files.map((f, i) => (
                    <li key={f.id}>
                        {f.name} {f.durationSec ? `(${formatMSS(f.durationSec)})` : ''}
                        <button onClick={() => move(i, i - 1)} disabled={i === 0} style={{ marginLeft: 8 }}>↑</button>
                        <button onClick={() => move(i, i + 1)} disabled={i === files.length - 1} style={{ marginLeft: 4 }}>↓</button>
                    </li>
                ))}
            </ol>
        </div>
    )
}

function formatMSS(s: number) {
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${Math.floor(s % 60)}`.padStart(2, '0')
    return `${mm}:${ss}`
}


