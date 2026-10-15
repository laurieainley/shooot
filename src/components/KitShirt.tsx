import { useId } from 'react'
import { MULTI_SEGMENTS, isMultiColor, solidTeamColor } from '../utils/teamColor'
import { kitTextColor } from '../utils/kitText'

interface KitShirtProps {
    /** The kit colour (a CSS colour, or the multicolour value). */
    color?: string
    /** Initials or a shirt number printed on the front. */
    label?: string
    /** Width and height in px (default 24). */
    size?: number
    className?: string
}

/** A shirt in the kit colour, optionally with letters or a number printed on it. The outline keeps a white kit visible on a light background. Decorative. */
export function KitShirt({ color, label, size = 24, className }: KitShirtProps) {
    const gid = useId()
    const multi = isMultiColor(color)
    const text = kitTextColor(color)
    const fontSize = !label ? 0 : label.length <= 1 ? 10 : label.length === 2 ? 7 : 5.4
    return (
        <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
            {multi && (
                <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                        {MULTI_SEGMENTS.flatMap((c, i) => [
                            <stop key={`${i}a`} offset={`${(i / MULTI_SEGMENTS.length) * 100}%`} stopColor={c} />,
                            <stop key={`${i}b`} offset={`${((i + 1) / MULTI_SEGMENTS.length) * 100}%`} stopColor={c} />,
                        ])}
                    </linearGradient>
                </defs>
            )}
            <path fill={multi ? `url(#${gid})` : solidTeamColor(color, 'var(--sh-surface-2)')} stroke="var(--sh-muted)" strokeWidth="1.2" strokeLinejoin="round"
                d="M8.5 3.5 3 6.2l1.8 4.6 2.7-1V20.5h9V9.8l2.7 1L21 6.2l-5.5-2.7c-.5 1.4-1.8 2.2-3.5 2.2s-3-.8-3.5-2.2z" />
            {label && (
                <text
                    x="12" y="14.2" textAnchor="middle" fontSize={fontSize} fontWeight="800"
                    fill={text.fill}
                    stroke={text.stroke} strokeWidth={text.stroke ? 1.6 : undefined} paintOrder="stroke" strokeLinejoin="round"
                    style={{ fontFamily: "var(--sh-font-shirt, 'Big Shoulders Display', sans-serif)", letterSpacing: '0.02em' }}
                >{label}</text>
            )}
        </svg>
    )
}
