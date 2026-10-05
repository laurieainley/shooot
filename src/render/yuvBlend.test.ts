import { describe, it, expect } from 'vitest'
import { blendRgba, rgbToYuv, type YuvPlanes } from './yuvBlend'

function i420(width: number, height: number, y: number, u: number, v: number): YuvPlanes {
    const cw = width / 2
    const ch = height / 2
    const data = new Uint8Array(width * height + 2 * cw * ch)
    data.fill(y, 0, width * height)
    data.fill(u, width * height, width * height + cw * ch)
    data.fill(v, width * height + cw * ch)
    return { format: 'I420', width, height, data, planes: [{ offset: 0, stride: width }, { offset: width * height, stride: cw }, { offset: width * height + cw * ch, stride: cw }] }
}

function nv12(width: number, height: number, y: number, u: number, v: number): YuvPlanes {
    const data = new Uint8Array(width * height * 1.5)
    data.fill(y, 0, width * height)
    for (let i = width * height; i < data.length; i += 2) { data[i] = u; data[i + 1] = v }
    return { format: 'NV12', width, height, data, planes: [{ offset: 0, stride: width }, { offset: width * height, stride: width }] }
}

const rgba = (w: number, h: number, [r, g, b, a]: number[]): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a }
    return d
}

describe('rgbToYuv', () => {
    it('should map white and black to the limited range ends', () => {
        expect(rgbToYuv(255, 255, 255, 'bt709', false)).toEqual([235, 128, 128])
        expect(rgbToYuv(0, 0, 0, 'bt709', false)).toEqual([16, 128, 128])
    })

    it('should use the full range when asked', () => {
        expect(rgbToYuv(255, 255, 255, 'bt709', true)).toEqual([255, 128, 128])
        expect(rgbToYuv(0, 0, 0, 'bt709', true)).toEqual([0, 128, 128])
    })

    it('should apply the BT.709 matrix to the card navy', () => {
        // #0f2347: Y' = .2126*15 + .7152*35 + .0722*71 = 33.33 → 16 + 219*33.33/255 = 44.6
        const [y, u, v] = rgbToYuv(0x0f, 0x23, 0x47, 'bt709', false)
        expect(y).toBe(45)
        expect(u).toBeGreaterThan(128)
        expect(v).toBeLessThan(128)
    })

    it('should differ between BT.601 and BT.709 for saturated colours', () => {
        expect(rgbToYuv(255, 0, 0, 'bt601', false)[0]).toBe(81)
        expect(rgbToYuv(255, 0, 0, 'bt709', false)[0]).toBe(63)
    })
})

describe('blendRgba', () => {
    it('should leave planes untouched where the overlay is transparent', () => {
        const f = i420(8, 8, 100, 90, 160)
        const before = f.data.slice()
        blendRgba(f, { data: rgba(4, 4, [255, 255, 255, 0]), width: 4, height: 4, x: 2, y: 2 }, 'bt709', false)
        expect(f.data).toEqual(before)
    })

    it('should replace luma and chroma under an opaque overlay only', () => {
        const f = i420(8, 8, 100, 90, 160)
        blendRgba(f, { data: rgba(4, 4, [255, 255, 255, 255]), width: 4, height: 4, x: 2, y: 2 }, 'bt709', false)
        expect(f.data[2 * 8 + 2]).toBe(235)
        expect(f.data[5 * 8 + 5]).toBe(235)
        expect(f.data[1 * 8 + 2]).toBe(100)
        expect(f.data[2 * 8 + 6]).toBe(100)
        const u = (cx: number, cy: number): number => f.data[64 + cy * 4 + cx]
        expect(u(1, 1)).toBe(128)
        expect(u(0, 0)).toBe(90)
    })

    it('should mix half-transparent pixels', () => {
        const f = i420(4, 4, 16, 128, 128)
        blendRgba(f, { data: rgba(4, 4, [255, 255, 255, 128]), width: 4, height: 4, x: 0, y: 0 }, 'bt709', false)
        expect(f.data[0]).toBeGreaterThanOrEqual(125)
        expect(f.data[0]).toBeLessThanOrEqual(127)
    })

    it('should write interleaved NV12 chroma', () => {
        const f = nv12(4, 4, 50, 60, 70)
        blendRgba(f, { data: rgba(2, 2, [0, 0, 0, 255]), width: 2, height: 2, x: 2, y: 0 }, 'bt709', true)
        expect([...f.data.subarray(16, 20)]).toEqual([60, 70, 128, 128])
        expect(f.data[2]).toBe(0)
        expect(f.data[0]).toBe(50)
    })

    it('should clip an overlay that runs past the frame edges', () => {
        const f = i420(4, 4, 16, 128, 128)
        blendRgba(f, { data: rgba(4, 4, [255, 255, 255, 255]), width: 4, height: 4, x: 2, y: -2 }, 'bt709', false)
        expect([...f.data.subarray(0, 4)]).toEqual([16, 16, 235, 235])
        expect([...f.data.subarray(8, 12)]).toEqual([16, 16, 16, 16])
    })
})
