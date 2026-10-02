interface LogoProps {
    height?: number
    className?: string
}

export function Logo({ height = 32, className = '' }: LogoProps) {
    const width = Math.round(height * 5)
    return (
        <svg
            viewBox="0 0 400 88"
            width={width}
            height={height}
            className={className}
            role="img"
            aria-label="SHOOOT"
        >
            {/* S */}
            <path d="M10 66c0 0 7 10 22 10s22-7 22-16-7-13-22-17S10 34 10 24 17 8 32 8s22 10 22 10" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
            {/* H */}
            <path d="M68 10v68M98 10v68M68 44h30" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
            {/* O */}
            <ellipse cx="142" cy="44" rx="26" ry="34" fill="none" stroke="currentColor" strokeWidth="11" />
            {/* O */}
            <ellipse cx="206" cy="44" rx="26" ry="34" fill="none" stroke="currentColor" strokeWidth="11" />
            {/* O */}
            <ellipse cx="270" cy="44" rx="26" ry="34" fill="none" stroke="currentColor" strokeWidth="11" />
            {/* T */}
            <path d="M310 10h42M331 10v68" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
