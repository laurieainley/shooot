import wordmarkOnDark from '../../brand/shooot/assets/wordmark-on-dark.svg'
import wordmarkOnLight from '../../brand/shooot/assets/wordmark-on-light.svg'
import { PRODUCT_NAME } from '../brand'

/** The outlined wordmark, one art per theme (OS or [data-theme]; see App.css `.wordmark`). Min 96px wide, never live text. */
export function Wordmark() {
    return (
        <span className="wordmark">
            <img className="wordmark__dark" src={wordmarkOnDark} alt={PRODUCT_NAME} draggable={false} />
            <img className="wordmark__light" src={wordmarkOnLight} alt="" aria-hidden="true" draggable={false} />
        </span>
    )
}
