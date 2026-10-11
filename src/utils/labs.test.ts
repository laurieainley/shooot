import { describe, expect, it } from 'vitest'
import { labsFromSearch } from './labs'

describe('labsFromSearch', () => {
    it('should turn labs on for ?labs=1', () => { expect(labsFromSearch('?labs=1')).toBe(true) })
    it('should turn labs off for ?labs=0', () => { expect(labsFromSearch('?a=b&labs=0')).toBe(false) })
    it('should leave labs alone otherwise', () => {
        expect(labsFromSearch('')).toBeNull()
        expect(labsFromSearch('?labs=yes')).toBeNull()
        expect(labsFromSearch('?other=1')).toBeNull()
    })
})
