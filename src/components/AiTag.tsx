export const AI_TAG_TEXT = 'Finds likely goals with AI on this device — check each one'

/** Small chalk tag marking Find goals as AI-assisted: the guesses need a human check. */
export function AiTag() {
    return (
        <span className="beta-tag ai-tag" title={AI_TAG_TEXT}>
            AI<span className="sr-only"> — {AI_TAG_TEXT}</span>
        </span>
    )
}
