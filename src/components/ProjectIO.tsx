import { useAppState } from '../state'

export function ProjectIO() {
    const goals = useAppState((s) => s.goals)
    const setGoals = useAppState((s) => s.setGoals)

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
                alert(`Imported ${data.goals.length} goals successfully!`)
            }
        } catch (error) {
            alert('Failed to import JSON file. Please check the format.')
        }
        // Reset the input so the same file can be imported again
        evt.target.value = ''
    }

    const onClearGoals = () => {
        if (goals.length === 0) {
            alert('No goals to clear.')
            return
        }

        const confirmed = confirm(`Are you sure you want to clear all ${goals.length} goals? This cannot be undone.`)
        if (confirmed) {
            setGoals([])
        }
    }

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={onExport} disabled={goals.length === 0}>
                Export JSON ({goals.length} goals)
            </button>
            <label style={{ cursor: 'pointer', backgroundColor: '#007bff', color: 'white', padding: '6px 12px', borderRadius: '4px', border: 'none' }}>
                Import JSON
                <input
                    type="file"
                    accept=".json,application/json"
                    onChange={onImport}
                    style={{ display: 'none' }}
                />
            </label>
            <button
                onClick={onClearGoals}
                disabled={goals.length === 0}
                style={{ backgroundColor: '#ff4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px' }}
            >
                Clear All Goals
            </button>
        </div>
    )
}


