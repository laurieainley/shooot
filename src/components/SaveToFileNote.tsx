import { useEffect, useState } from 'react'
import { importedParts } from '../render/unitCache'
import { usePartsLoaded } from '../prepare/partsLoad'

/** Under "Save to file…": a file saved as it goes keeps one encoder, so parts loaded from another device are not used there (the in-browser render uses them). */
export function SaveToFileNote() {
    const [device, setDevice] = useState<string | null>(null)
    // Re-read when a parts file is loaded while the Export panel is open.
    const loads = usePartsLoaded()
    useEffect(() => {
        let live = true
        void importedParts().then((p) => { if (live) setDevice(p?.device ?? null) })
        return () => { live = false }
    }, [loads])
    return device ? <p className="export-hint m-0">Prepared parts from {device} aren’t used when saving straight to a file.</p> : null
}
