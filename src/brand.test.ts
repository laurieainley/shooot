import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_NAME, productTitle, madeWith } from './brand'

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) return sourceFiles(p)
        return /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) ? [p] : []
    })
}

describe('brand', () => {
    it('should name the product Shooot with one capital and three Os', () => {
        expect(PRODUCT_NAME).toBe('Shooot')
        expect(productTitle()).toBe('Shooot')
        expect(madeWith()).toBe('Made with Shooot')
    })

    it('should keep the page title in index.html in step with the product name', () => {
        const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
        expect(html).toContain(`<title>${PRODUCT_NAME}`)
    })

    it('should never write SHOOOT in source outside the wordmark art (running text uses PRODUCT_NAME)', () => {
        const hits = sourceFiles(join(process.cwd(), 'src')).filter((f) => /SHOOOT/.test(readFileSync(f, 'utf8')))
        expect(hits).toEqual([])
    })
})
