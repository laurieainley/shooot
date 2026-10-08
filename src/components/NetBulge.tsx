interface NetBulgeProps {
    /** 'once' plays the bulge once (goal marked, reel ready); 'loop' repeats (loading). */
    mode: 'once' | 'loop'
    /** Pixel size of the O (the pack's default is 96). */
    size?: number
    label?: string
}

/** The brand's signature motion: the REC dot is shot into the O, which stretches like a net, then settles. Motion only; reduced motion shows the final frame. */
export function NetBulge({ mode, size = 28, label }: NetBulgeProps) {
    return (
        <span className={`sh-net ${mode === 'loop' ? 'is-looping' : 'is-playing'}`} style={{ '--size': `${size}px` } as React.CSSProperties}
            {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
            <span className="sh-net__ring"><span className="sh-net__dot" /></span>
        </span>
    )
}
