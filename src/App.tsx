import './App.css'
import { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { ReceiveProject } from './components/ReceiveProject'
import { useAppState } from './state'

const DEFAULT_VIDEO_URL = '/default-video.mp4'
const DEFAULT_VIDEO_NAME = 'TNF full match 19-03-26.mp4'

function App() {
    const files = useAppState((s) => s.files)
    const setFiles = useAppState((s) => s.setFiles)

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

    return <><AppShell /><ReceiveProject /></>
}

export default App
