/** The product name lives here only: a rename is a one-line change. The wordmark art is `brand/shooot/assets/`. */
export const PRODUCT_NAME = 'Shooot'

/** The browser tab / install name. */
export function productTitle(): string {
    return PRODUCT_NAME
}

/** The reel end-line stem ("Made with Shooot"). */
export function madeWith(): string {
    return `Made with ${PRODUCT_NAME}`
}
