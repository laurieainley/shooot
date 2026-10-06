import { describe, it, expect } from 'vitest'
import { applyOverlay, blendRgba, i420Layout, isYuv420, convertRange, fadeI420, prepareOverlay, rgbaToI420, rgbToYuv, targetColorSpace, type YuvPlanes } from './yuvBlend'

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

describe('convertRange', () => {
    it('should stretch limited-range samples to full range', () => {
        const f = i420(2, 2, 16, 16, 240)
        f.data[0] = 235
        f.data[1] = 126
        convertRange(f, true)
        expect([...f.data.subarray(0, 4)]).toEqual([255, 128, 0, 0])
        expect(f.data[4]).toBe(1) // 128 - 112·255/224 = 0.5
        expect(f.data[5]).toBe(255)
    })

    it('should squeeze full-range samples to limited range (NV12)', () => {
        const f = nv12(2, 2, 255, 0, 128)
        convertRange(f, false)
        expect([...f.data]).toEqual([235, 235, 235, 235, 16, 128])
    })
})

describe('rgbaToI420 against a per-pixel reference', () => {
    // The straightforward formulation: Y per pixel, chroma = mean of (B-Y), (R-Y) over the 2x2 block.
    function reference(d: Uint8ClampedArray, w: number, h: number, kr: number, kb: number, full: boolean): Uint8Array {
        const kg = 1 - kr - kb
        const cw = Math.ceil(w / 2)
        const ch = Math.ceil(h / 2)
        const out = new Uint8Array(w * h + 2 * cw * ch)
        const ys = full ? 255 : 219, yo = full ? 0 : 16, cs = full ? 255 : 224
        const uS = new Float64Array(cw * ch), vS = new Float64Array(cw * ch), n = new Float64Array(cw * ch)
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255
            const Y = kr * R + kg * G + kb * B
            out[y * w + x] = Math.round(yo + ys * Y)
            const c = (y >> 1) * cw + (x >> 1)
            uS[c] += (B - Y) / (2 * (1 - kb)); vS[c] += (R - Y) / (2 * (1 - kr)); n[c]++
        }
        for (let c = 0; c < cw * ch; c++) {
            out[w * h + c] = Math.round(128 + (cs * uS[c]) / n[c])
            out[w * h + cw * ch + c] = Math.round(128 + (cs * vS[c]) / n[c])
        }
        return out
    }
    it.each([[8, 6], [7, 5], [6, 3], [1, 1]])('should match it within one level for %ix%i frames, both ranges', (w, h) => {
        const d = new Uint8ClampedArray(w * h * 4)
        let seed = 12345
        for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = i % 4 === 3 ? 255 : seed >> 8 }
        for (const full of [false, true]) {
            const got = rgbaToI420(d, w, h, 'bt709', full)
            const want = reference(d, w, h, 0.2126, 0.0722, full)
            expect(got.length).toBe(want.length)
            for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - want[i])).toBeLessThanOrEqual(1)
        }
    })
})

describe('rgbaToI420', () => {
    it('should give a frame-sized I420 buffer with the matrix and range asked for', () => {
        const out = rgbaToI420(rgba(4, 2, [255, 255, 255, 255]), 4, 2, 'bt709', true)
        expect(out.length).toBe(4 * 2 * 1.5)
        expect([...out.subarray(0, 8)]).toEqual(Array(8).fill(255))
        expect([...out.subarray(8)]).toEqual([128, 128, 128, 128])
        const navy = rgbaToI420(rgba(2, 2, [0x0f, 0x23, 0x47, 255]), 2, 2, 'bt709', false)
        expect(navy[0]).toBe(rgbToYuv(0x0f, 0x23, 0x47, 'bt709', false)[0])
    })
})

describe('targetColorSpace', () => {
    it('should copy the footage tags without inventing primaries or transfer', () => {
        expect(targetColorSpace({ matrix: 'bt709', fullRange: true })).toEqual({ matrix: 'bt709', fullRange: true })
        expect(targetColorSpace({ matrix: 'bt709', primaries: 'smpte170m', transfer: 'iec61966-2-1', fullRange: false }))
            .toEqual({ matrix: 'bt709', primaries: 'smpte170m', transfer: 'iec61966-2-1', fullRange: false })
    })

    it('should make the range explicit (limited when unknown)', () => {
        expect(targetColorSpace(undefined)).toEqual({ fullRange: false })
        expect(targetColorSpace({ matrix: 'smpte170m' })).toEqual({ matrix: 'smpte170m', fullRange: false })
    })
})

describe('fadeI420', () => {
    it('should scale luma towards black and chroma towards neutral', () => {
        const src = new Uint8Array([235, 235, 235, 235, 240, 16])
        const out = new Uint8Array(6)
        fadeI420(src, out, 4, 0.5, false)
        expect([...out]).toEqual([126, 126, 126, 126, 184, 72])
        fadeI420(src, out, 4, 0, true)
        expect([...out]).toEqual([0, 0, 0, 0, 128, 128])
        fadeI420(src, out, 4, 1, true)
        expect([...out]).toEqual([...src])
    })
})

describe('prepareOverlay / applyOverlay', () => {
    it('should give the same planes as blendRgba', () => {
        const img = { data: rgba(4, 4, [0x0f, 0x23, 0x47, 200]), width: 4, height: 4, x: 2, y: 1 }
        const a = i420(8, 8, 100, 90, 160)
        const b = i420(8, 8, 100, 90, 160)
        blendRgba(a, img, 'bt709', true)
        applyOverlay(b, prepareOverlay(img, 'bt709', true))
        expect(b.data).toEqual(a.data)
    })
})

describe('isYuv420', () => {
    it('should accept the planar 4:2:0 formats we can blend into directly', () => {
        expect(isYuv420('I420')).toBe(true)
        expect(isYuv420('NV12')).toBe(true)
    })
    it('should reject RGB formats and opaque (null) frames, which go through a canvas', () => {
        for (const f of ['RGBA', 'RGBX', 'BGRA', 'BGRX', 'I420A', 'I444', null] as const) expect(isYuv420(f)).toBe(false)
    })
})

describe('i420Layout', () => {
    it('should describe packed Y, U, V planes as written by rgbaToI420', () => {
        expect(i420Layout(4, 2)).toEqual([{ offset: 0, stride: 4 }, { offset: 8, stride: 2 }, { offset: 10, stride: 2 }])
        expect(i420Layout(3, 3)).toEqual([{ offset: 0, stride: 3 }, { offset: 9, stride: 2 }, { offset: 13, stride: 2 }])
    })
})
