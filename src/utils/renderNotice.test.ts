import { describe, it, expect } from 'vitest'
import { keepOpenNotice, suspendsInBackground } from './renderNotice'

const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150', platform: 'MacIntel', maxTouchPoints: 0 }
const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', platform: 'MacIntel', maxTouchPoints: 5 }
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }
const android = { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/150 Mobile', platform: 'Linux armv8l', maxTouchPoints: 5 }

describe('suspendsInBackground', () => {
    it('should be true for phones and tablets, which pause pages when you switch app', () => {
        expect(suspendsInBackground(iphone)).toBe(true)
        expect(suspendsInBackground(ipad)).toBe(true)
        expect(suspendsInBackground(android)).toBe(true)
    })
    it('should be false for desktop browsers', () => {
        expect(suspendsInBackground(mac)).toBe(false)
    })
})

describe('keepOpenNotice', () => {
    it('should let desktop users switch tabs but not close this one', () => {
        expect(keepOpenNotice(mac)).toBe('You can switch tabs. Don’t close this one until the render finishes.')
    })
    it('should ask phone and tablet users to keep the screen open', () => {
        expect(keepOpenNotice(android)).toBe('Keep this screen open until the render finishes. Switching app pauses it; it picks up where it left off.')
    })
})
