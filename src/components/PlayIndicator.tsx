interface PlayIndicatorProps {
    /** Paused and not scrubbing. */
    visible: boolean
}

/**
 * A large play icon centred on the picture whenever the video is paused (not only video.js's big-play button
 * before the first play). Purely a signal: taps pass through to the picture, which toggles playback.
 */
export function PlayIndicator({ visible }: PlayIndicatorProps) {
    if (!visible) return null
    return (
        <div className="play-indicator" data-testid="play-indicator" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
        </div>
    )
}
