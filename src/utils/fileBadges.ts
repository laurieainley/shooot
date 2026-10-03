import type { VideoSourceFile } from '../types'

export function fileBadges(f: VideoSourceFile): string[] {
    const badges: string[] = []
    if (f.playbackIssue) badges.push("can't play here")
    if (f.kind === 'proxy') badges.push('proxy', f.fullFile ? 'full attached' : 'preview only')
    else if (f.codec === 'hevc') badges.push('HEVC')
    return badges
}
