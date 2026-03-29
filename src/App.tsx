import './App.css'
import { useRef } from 'react'
import { FilePills } from './components/FilePills'
import { Player } from './components/Player'
import { AddGoalBar } from './components/AddGoalBar'
import { GoalList } from './components/GoalList'
import { ClipSettings } from './components/ClipSettings'
import { OutputPanel } from './components/OutputPanel'
import { useAppState } from './state'

function App() {
    const goals = useAppState((s) => s.goals)
    const setGoals = useAppState((s) => s.setGoals)
    const importRef = useRef<HTMLInputElement | null>(null)

    const onExport = () => {
        const blob = new Blob([JSON.stringify({ goals }, null, 2)], { type: 'application/json' })
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
            if (Array.isArray(data.goals)) {
                setGoals(data.goals)
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
                <span className="text-yellow font-black text-xl tracking-[4px]">SHOOOT</span>
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
            <Player />

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
