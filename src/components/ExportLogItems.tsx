import { useEffect, useState } from 'react'
import { deliverLog, loadLogDownload, type LogDownload } from '../exportLog'
import { setBaseline, useBaseline } from '../prepare/baseline'

/** ⋯ menu: the export timing log as a file. It is read when the menu opens so the tap can share or download at once (iPad browsers want that). */
export function DownloadLogItem() {
    const [log, setLog] = useState<LogDownload | null>(null)
    const [done, setDone] = useState<string | null>(null)
    useEffect(() => {
        let live = true
        void loadLogDownload().then((d) => { if (live) setLog(d) })
        return () => { live = false }
    }, [])
    const click = (): void => {
        if (!log) return
        void deliverLog(log).then((r) => setDone(r === 'empty' ? 'Nothing logged yet' : r === 'failed' ? 'The download did not start' : r === 'shared' ? 'Shared' : 'Downloaded'))
    }
    return (
        <button type="button" role="menuitem" onClick={click} disabled={!log} title="Every export and background-prepare run, with its timings, as a JSON Lines file">
            Download export timing log{log ? ` (${log.count})` : ''}{done ? ` — ${done}` : ''}
        </button>
    )
}

/** ⋯ menu: runs the NEXT export with the unit cache off, to compare its time with a normal one. */
export function BaselineItem() {
    const on = useBaseline()
    return (
        <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => setBaseline(!on)} title="The next export ignores the prepared parts and encodes everything, and is logged as such">
            Export without prepared parts: {on ? 'on, for the next export' : 'off'}
        </button>
    )
}
