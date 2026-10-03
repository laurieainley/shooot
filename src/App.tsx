import './App.css'
import { useEffect, useRef } from 'react'
import { FilePills } from './components/FilePills'
import { Player } from './components/Player'
import { EmptyPlayer } from './components/EmptyPlayer'
import { AddGoalBar } from './components/AddGoalBar'
import { GoalList } from './components/GoalList'
import { ClipSettings } from './components/ClipSettings'
import { OutputPanel } from './components/OutputPanel'
import { Logo } from './components/Logo'
import { useAppState } from './state'

const DEFAULT_VIDEO_URL = '/default-video.mp4'
const DEFAULT_VIDEO_NAME = 'TNF full match 19-03-26.mp4'

function App() {
    const goals = useAppState((s) => s.events)
    const setGoals = useAppState((s) => s.setEvents)
    const files = useAppState((s) => s.files)
    const setFiles = useAppState((s) => s.setFiles)
    const importRef = useRef<HTMLInputElement | null>(null)

    // Global undo/redo keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey
            if (isMod && e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                useAppState.getState().undo()
            } else if (isMod && e.key === 'z' && e.shiftKey) {
                e.preventDefault()
                useAppState.getState().redo()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Auto-load default video on startup if no files are loaded
    useEffect(() => {
        if (files.length > 0) return
        let cancelled = false
        ;(async () => {
            try {
                const resp = await fetch(DEFAULT_VIDEO_URL)
                if (!resp.ok || cancelled) return
                const blob = await resp.blob()
                if (cancelled) return
                const file = new File([blob], DEFAULT_VIDEO_NAME, { type: 'video/mp4' })
                const url = URL.createObjectURL(file)
                // Probe duration via a temp video element
                const video = document.createElement('video')
                video.preload = 'metadata'
                video.src = url
                video.addEventListener('loadedmetadata', () => {
                    if (cancelled) return
                    setFiles([{
                        id: `${Date.now()}-0`,
                        file,
                        url,
                        name: DEFAULT_VIDEO_NAME,
                        durationSec: isFinite(video.duration) ? video.duration : undefined,
                        width: video.videoWidth || undefined,
                        height: video.videoHeight || undefined,
                        kind: 'full',
                    }])
                })
            } catch {
                // Silently fail — user can still load files manually
            }
        })()
        return () => { cancelled = true }
    }, [])

    const onExport = () => {
        const blob = new Blob([JSON.stringify({ events: goals, goals }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'project.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    const onImport = async (evt: React.ChangeEvent<HTMLInputElement>) => {
        const file = evt.target.files?.[0]
        if (!file) return
        const text = await file.text()
        try {
            const data = JSON.parse(text)
            const imported = Array.isArray(data.events) ? data.events : Array.isArray(data.goals) ? data.goals : null
            if (imported) {
                setGoals(imported.map((e: any) => ({ ...e, type: e.type ?? 'goal' })))
            }
        } catch {
            alert('Failed to import JSON file.')
        }
        evt.target.value = ''
    }

    return (
        <div className="max-w-[1920px] mx-auto px-4 py-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-4">
                <Logo height={28} className="text-yellow" />
                <div className="flex items-center gap-2">
                    <button
                        onClick={onExport}
                        disabled={goals.length === 0}
                        className="rounded bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted border-none cursor-pointer hover:text-light transition-colors disabled:opacity-30"
                    >
                        Export
                    </button>
                    <button
                        onClick={() => importRef.current?.click()}
                        className="rounded bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted border-none cursor-pointer hover:text-light transition-colors"
                    >
                        Import
                    </button>
                    <input
                        ref={importRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={onImport}
                        className="hidden"
                    />
                </div>
            </div>

            {/* File Pills */}
            <div className="mb-3">
                <FilePills />
            </div>

            {/* Player */}
            {files.length > 0 ? <Player /> : <EmptyPlayer />}

            {/* Add Goal Bar */}
            <div className="mt-1.5 mb-4">
                <AddGoalBar />
            </div>

            {/* Panel Grid */}
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
                {/* Goals Panel — spans 2 rows on desktop */}
                <div className="md:row-span-2">
                    <GoalList />
                </div>

                {/* Clip Settings */}
                <ClipSettings />

                {/* Output */}
                <OutputPanel />
            </div>
        </div>
    )
}

export default App
