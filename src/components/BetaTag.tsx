export const BETA_TAG_TEXT = 'Shooot is in beta: things may change'

/** Small chalk tag next to the logo: the whole app is still being tried out. */
export function BetaTag() {
    return <span className="beta-tag" title={BETA_TAG_TEXT}>Beta</span>
}
