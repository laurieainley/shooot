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
