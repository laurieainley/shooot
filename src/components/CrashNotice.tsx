import { dismissCrashNote, useCrashNote } from '../crashNoteRuntime'
import { crashReportText, describeCrash } from '../utils/crashNote'
import { previousPlaybackReportText } from '../playbackDiagnostics'
import { CopyDiagnostics } from './CopyDiagnostics'

/** Shown once after the browser reloaded the page by itself during heavy work (see utils/crashNote.ts). */
export function CrashNotice() {
    const note = useCrashNote()
    if (!note) return null
    const text = (): string => crashReportText(note, { userAgent: navigator.userAgent, platform: navigator.platform }, previousPlaybackReportText())
    return (
        <div className="crash-notice" role="alert">
            <p className="crash-notice__text">{describeCrash(note)}</p>
            <div className="crash-notice__actions">
                <CopyDiagnostics getText={text} label="Copy details" ariaLabel="Crash details" />
                <button type="button" className="btn-quiet" onClick={dismissCrashNote}>Dismiss</button>
            </div>
        </div>
    )
}
