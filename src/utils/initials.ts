/**
 * Team initials derived from a name: one word → its first two letters; two or more words → the first letter of each
 * of up to three words. Uppercase; punctuation is ignored. A blank name gives ''.
 */
export function deriveInitials(name: string): string {
    const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
    if (words.length === 0) return ''
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}
