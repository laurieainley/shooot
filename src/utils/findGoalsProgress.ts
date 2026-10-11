import { checkingGoalsLine, listeningLine } from './voice'

/** The live Find goals progress line (audio, then the Labs ball check), or null when nothing is running. */
export function findGoalsProgress(job: { phase: string; fraction: number; ballPhase: string; ballFraction: number; ballEp: string | null }): { line: string; percent: number } | null {
    if (job.phase === 'running') return { line: listeningLine(job.fraction), percent: Math.round(job.fraction * 100) }
    if (job.ballPhase === 'running') return { line: checkingGoalsLine(job.ballFraction, job.ballEp), percent: Math.round(job.ballFraction * 100) }
    return null
}
