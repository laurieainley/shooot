import { useRef, useState } from 'react'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { probeVideoFile } from '../utils/probe'

export function FilePicker() {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const setFiles = useAppState((s) => s.setFiles)
    const [message, setMessage] = useState<string | null>(null)

    const onPick = async (evt: React.ChangeEvent<HTMLInputElement>) => {
        const list = evt.target.files
        if (!list || list.length === 0) return
        const picked: VideoSourceFile[] = []
        for (const [idx, f] of Array.from(list).entries()) {
            const meta = await probeVideoFile(f)
            if (!meta.playable) {
                setMessage(meta.error || 'Unsupported file')
                continue
            }
            picked.push({
                id: `${Date.now()}-${idx}`,
                file: f,
                url: URL.createObjectURL(f),
                name: f.name,
                durationSec: meta.durationSec,
                width: meta.width,
                height: meta.height,
            })
        }
        setFiles(picked)
    }

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                multiple
                onChange={onPick}
            />
            {message && <p style={{ color: 'red' }}>{message}</p>}
        </div>
    )
}


