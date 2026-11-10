import { useAppState } from '../state'
import { isCoarsePointer } from '../prepare/wire'
import { accept4k, offer4k } from '../prepare/offer4k'

export const OFFER_TIP = 'Starts encoding the 4K full match now so Export is quicker later.'

/**
 * Touch screens only: on Original there is nothing to prepare, so offer the one tap that makes something to prepare. It is a second
 * row of the top bar (the first row is full on a phone), and the user's tap is the only thing that changes the quality.
 */
export function Prepare4kOffer() {
    const files = useAppState((s) => s.files)
    const fullMatchQuality = useAppState((s) => s.fullMatch.quality)
    const highlightsQuality = useAppState((s) => s.highlightsQuality)
    if (!isCoarsePointer() || !offer4k({ fullMatchQuality, highlightsQuality, files })) return null
    return (
        <div className="prep-offer">
            <button type="button" className="prep-offer__btn" title={OFFER_TIP} aria-describedby="prep-offer-tip" onClick={accept4k}>Prepare 4K</button>
            <span id="prep-offer-tip" className="prep-offer__tip">{OFFER_TIP}</span>
        </div>
    )
}
