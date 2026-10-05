// Draws an RGBA overlay straight into decoded 4:2:0 planes, so footage pixels outside the overlay never go
// through an RGB round trip (and keep their exact colour) before being re-encoded.

export type YuvMatrix = 'bt709' | 'bt601' | 'bt2020'
export type PlaneLayout = { offset: number; stride: number }
export type YuvPlanes = {
    format: 'I420' | 'NV12'
    width: number
    height: number
    data: Uint8Array
    /** I420: Y, U, V. NV12: Y, interleaved UV. */
    planes: PlaneLayout[]
}
export type RgbaImage = { data: Uint8ClampedArray; width: number; height: number; x: number; y: number }

const KR_KB: Record<YuvMatrix, [number, number]> = { bt709: [0.2126, 0.0722], bt601: [0.299, 0.114], bt2020: [0.2627, 0.0593] }

/** The YUV matrix of a WebCodecs colour space (unknown → BT.709, the HD default). */
export function matrixOf(matrix: string | null | undefined): YuvMatrix {
    if (matrix === 'smpte170m' || matrix === 'bt470bg') return 'bt601'
    if (matrix === 'bt2020-ncl') return 'bt2020'
    return 'bt709'
}

function yuvFloat(r: number, g: number, b: number, m: YuvMatrix, full: boolean): [number, number, number] {
    const [kr, kb] = KR_KB[m]
    const kg = 1 - kr - kb
    const R = r / 255
    const G = g / 255
    const B = b / 255
    const y = kr * R + kg * G + kb * B
    const pb = (B - y) / (2 * (1 - kb))
    const pr = (R - y) / (2 * (1 - kr))
    return full ? [255 * y, 128 + 255 * pb, 128 + 255 * pr] : [16 + 219 * y, 128 + 224 * pb, 128 + 224 * pr]
}

const clamp8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

export function rgbToYuv(r: number, g: number, b: number, m: YuvMatrix, fullRange: boolean): [number, number, number] {
    const [y, u, v] = yuvFloat(r, g, b, m, fullRange)
    return [clamp8(y), clamp8(u), clamp8(v)]
}

/** Alpha-blends `img` (straight alpha) into the planes at (img.x, img.y); clipped to the frame. */
export function blendRgba(f: YuvPlanes, img: RgbaImage, m: YuvMatrix, fullRange: boolean): void {
    const x0 = Math.max(0, img.x)
    const y0 = Math.max(0, img.y)
    const x1 = Math.min(f.width, img.x + img.width)
    const y1 = Math.min(f.height, img.y + img.height)
    if (x1 <= x0 || y1 <= y0) return
    const d = img.data
    const Y = f.planes[0]
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = ((y - img.y) * img.width + (x - img.x)) * 4
            const a = d[i + 3] / 255
            if (a === 0) continue
            const [yy] = yuvFloat(d[i], d[i + 1], d[i + 2], m, fullRange)
            const o = Y.offset + y * Y.stride + x
            f.data[o] = clamp8(f.data[o] * (1 - a) + yy * a)
        }
    }
    // Chroma: one sample per 2×2 block, mixed by the block's average coverage.
    const nv12 = f.format === 'NV12'
    const U = f.planes[1]
    const V = nv12 ? f.planes[1] : f.planes[2]
    for (let cy = y0 >> 1; cy < (y1 + 1) >> 1; cy++) {
        for (let cx = x0 >> 1; cx < (x1 + 1) >> 1; cx++) {
            let aSum = 0
            let uSum = 0
            let vSum = 0
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const px = cx * 2 + dx - img.x
                    const py = cy * 2 + dy - img.y
                    if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue
                    const i = (py * img.width + px) * 4
                    const a = d[i + 3] / 255
                    if (a === 0) continue
                    const [, u, v] = yuvFloat(d[i], d[i + 1], d[i + 2], m, fullRange)
                    aSum += a
                    uSum += a * u
                    vSum += a * v
                }
            }
            if (aSum === 0) continue
            const cover = aSum / 4
            const uo = nv12 ? U.offset + cy * U.stride + cx * 2 : U.offset + cy * U.stride + cx
            const vo = nv12 ? uo + 1 : V.offset + cy * V.stride + cx
            f.data[uo] = clamp8(f.data[uo] * (1 - cover) + uSum / 4)
            f.data[vo] = clamp8(f.data[vo] * (1 - cover) + vSum / 4)
        }
    }
}

/** Rescales the samples between limited (16–235/240) and full (0–255) range, in place. */
export function convertRange(f: YuvPlanes, toFull: boolean): void {
    const yMap = new Uint8Array(256)
    const cMap = new Uint8Array(256)
    for (let v = 0; v < 256; v++) {
        yMap[v] = clamp8(toFull ? ((v - 16) * 255) / 219 : 16 + (v * 219) / 255)
        cMap[v] = clamp8(toFull ? ((v - 128) * 255) / 224 + 128 : ((v - 128) * 224) / 255 + 128)
    }
    const remap = (p: PlaneLayout, rowBytes: number, rows: number, map: Uint8Array): void => {
        for (let y = 0; y < rows; y++) {
            const o = p.offset + y * p.stride
            for (let x = 0; x < rowBytes; x++) f.data[o + x] = map[f.data[o + x]]
        }
    }
    const cw = Math.ceil(f.width / 2)
    const ch = Math.ceil(f.height / 2)
    remap(f.planes[0], f.width, f.height, yMap)
    if (f.format === 'NV12') remap(f.planes[1], cw * 2, ch, cMap)
    else { remap(f.planes[1], cw, ch, cMap); remap(f.planes[2], cw, ch, cMap) }
}

/** Converts straight-alpha RGBA (alpha ignored) to a packed I420 buffer with the given matrix and range. */
export function rgbaToI420(rgba: Uint8ClampedArray, width: number, height: number, m: YuvMatrix, fullRange: boolean): Uint8Array {
    const cw = Math.ceil(width / 2)
    const ch = Math.ceil(height / 2)
    const out = new Uint8Array(width * height + 2 * cw * ch)
    const uOff = width * height
    const vOff = uOff + cw * ch
    const [kr, kb] = KR_KB[m]
    const kg = 1 - kr - kb
    const ys = fullRange ? 255 : 219
    const yo = fullRange ? 0 : 16
    const cs = fullRange ? 255 : 224
    const uSum = new Float32Array(cw * ch)
    const vSum = new Float32Array(cw * ch)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const R = rgba[i] / 255
            const G = rgba[i + 1] / 255
            const B = rgba[i + 2] / 255
            const Y = kr * R + kg * G + kb * B
            out[y * width + x] = clamp8(yo + ys * Y)
            const c = (y >> 1) * cw + (x >> 1)
            uSum[c] += (B - Y) / (2 * (1 - kb))
            vSum[c] += (R - Y) / (2 * (1 - kr))
        }
    }
    for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
            const n = (Math.min(2, width - cx * 2)) * (Math.min(2, height - cy * 2))
            const c = cy * cw + cx
            out[uOff + c] = clamp8(128 + (cs * uSum[c]) / n)
            out[vOff + c] = clamp8(128 + (cs * vSum[c]) / n)
        }
    }
    return out
}

/**
 * The colour space generated frames are tagged with: exactly the footage's tags (unspecified stays unspecified,
 * so joins never change colour signalling), with the range made explicit (default limited).
 */
export function targetColorSpace(cs: VideoColorSpaceInit | undefined): VideoColorSpaceInit {
    return { ...(cs ?? {}), fullRange: cs?.fullRange ?? false }
}
