import { useState } from 'react'
import { Logo } from './Logo'
import { useAppState } from '../state'
import { processVideoFiles } from '../utils/processFiles'

export function EmptyPlayer() {
    const setFiles = useAppState((s) => s.setFiles)
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const files = e.dataTransfer.files
        if (!files || files.length === 0) return
        const result = await processVideoFiles(files)
        if (result.error) setError(result.error)
        if (result.files.length > 0) setFiles(result.files)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
    }

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface py-16 px-8 transition-colors ${
                dragging ? 'border-yellow bg-yellow/5' : 'border-border'
            }`}
        >
            <Logo height={48} className="text-yellow mb-6" />
            <p className="text-muted text-sm mb-6">
                {dragging
                    ? 'Drop MP4 files to load them'
                    : <>Drop MP4 files here or click <strong className="text-light">+ Add file</strong> to get started</>
                }
            </p>
            {error && <p className="text-pink text-xs mb-4">{error}</p>}
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted">
                <span><kbd className="text-light font-bold">G</kbd> / <kbd className="text-light font-bold">M</kbd></span>
                <span>Mark goal</span>
                <span><kbd className="text-light font-bold">,</kbd> / <kbd className="text-light font-bold">.</kbd></span>
                <span>Speed down / up</span>
                <span><kbd className="text-light font-bold">/</kbd></span>
                <span>Reset speed</span>
                <span><kbd className="text-light font-bold">[</kbd> / <kbd className="text-light font-bold">]</kbd></span>
                <span>Prev / next file</span>
            </div>
        </div>
    )
}
