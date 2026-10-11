/** `?labs=1` switches Labs on, `?labs=0` off; anything else leaves it as it is (null). */
export function labsFromSearch(search: string): boolean | null {
    const v = new URLSearchParams(search).get('labs')
    return v === '1' ? true : v === '0' ? false : null
}
