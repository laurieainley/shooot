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

/** An overlay converted to YUV once: luma value + alpha per pixel, chroma contribution + coverage per 2×2 block. */
export type PreparedOverlay = {
    x: number; y: number; width: number; height: number
    luma: Float32Array; alpha: Float32Array
    cx0: number; cy0: number; cw: number; ch: number
    cover: Float32Array; uAdd: Float32Array; vAdd: Float32Array
}

export function prepareOverlay(img: RgbaImage, m: YuvMatrix, fullRange: boolean): PreparedOverlay {
    const { data: d, width: w, height: h } = img
    const [kr, kb] = KR_KB[m]
    const kg = 1 - kr - kb
    const ys = fullRange ? 255 : 219
    const yo = fullRange ? 0 : 16
    const cs = fullRange ? 255 : 224
    const luma = new Float32Array(w * h)
    const alpha = new Float32Array(w * h)
    const cx0 = Math.floor(img.x / 2)
    const cy0 = Math.floor(img.y / 2)
    const cw = Math.ceil((img.x + w) / 2) - cx0
    const ch = Math.ceil((img.y + h) / 2) - cy0
    const cover = new Float32Array(cw * ch)
    const uAdd = new Float32Array(cw * ch)
    const vAdd = new Float32Array(cw * ch)
    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const i = (py * w + px) * 4
            const a = d[i + 3] / 255
            if (a === 0) continue
            const R = d[i] / 255
            const G = d[i + 1] / 255
            const B = d[i + 2] / 255
            const Y = kr * R + kg * G + kb * B
            const k = py * w + px
            luma[k] = yo + ys * Y
            alpha[k] = a
            const c = (((img.y + py) >> 1) - cy0) * cw + (((img.x + px) >> 1) - cx0)
            cover[c] += a / 4
            uAdd[c] += (a * (128 + (cs * (B - Y)) / (2 * (1 - kb)))) / 4
            vAdd[c] += (a * (128 + (cs * (R - Y)) / (2 * (1 - kr)))) / 4
        }
    }
    return { x: img.x, y: img.y, width: w, height: h, luma, alpha, cx0, cy0, cw, ch, cover, uAdd, vAdd }
}

export function applyOverlay(f: YuvPlanes, o: PreparedOverlay): void {
    const x0 = Math.max(0, o.x)
    const y0 = Math.max(0, o.y)
    const x1 = Math.min(f.width, o.x + o.width)
    const y1 = Math.min(f.height, o.y + o.height)
    if (x1 <= x0 || y1 <= y0) return
    const Y = f.planes[0]
    for (let y = y0; y < y1; y++) {
        const row = Y.offset + y * Y.stride
        const src = (y - o.y) * o.width - o.x
        for (let x = x0; x < x1; x++) {
            const a = o.alpha[src + x]
            if (a === 0) continue
            f.data[row + x] = clamp8(f.data[row + x] * (1 - a) + o.luma[src + x] * a)
        }
    }
    const nv12 = f.format === 'NV12'
    const U = f.planes[1]
    const V = nv12 ? f.planes[1] : f.planes[2]
    for (let cy = y0 >> 1; cy < (y1 + 1) >> 1; cy++) {
        for (let cx = x0 >> 1; cx < (x1 + 1) >> 1; cx++) {
            const c = (cy - o.cy0) * o.cw + (cx - o.cx0)
            const cover = o.cover[c]
            if (!(cover > 0)) continue
            const uo = nv12 ? U.offset + cy * U.stride + cx * 2 : U.offset + cy * U.stride + cx
            const vo = nv12 ? uo + 1 : V.offset + cy * V.stride + cx
            f.data[uo] = clamp8(f.data[uo] * (1 - cover) + o.uAdd[c])
            f.data[vo] = clamp8(f.data[vo] * (1 - cover) + o.vAdd[c])
        }
    }
}

/** Alpha-blends `img` (straight alpha) into the planes at (img.x, img.y); clipped to the frame. */
export function blendRgba(f: YuvPlanes, img: RgbaImage, m: YuvMatrix, fullRange: boolean): void {
    applyOverlay(f, prepareOverlay(img, m, fullRange))
}

/** A packed I420 picture faded towards black: `level` 1 = unchanged, 0 = black. */
export function fadeI420(src: Uint8Array, dst: Uint8Array, lumaSize: number, level: number, fullRange: boolean): void {
    const yo = fullRange ? 0 : 16
    for (let i = 0; i < lumaSize; i++) dst[i] = clamp8(yo + (src[i] - yo) * level)
    for (let i = lumaSize; i < src.length; i++) dst[i] = clamp8(128 + (src[i] - 128) * level)
}

/** Rescales the samples between limited (16–235/240) and full (0–255) range, in place. */
export function convertRange(f: YuvPlanes, toFull: boolean): void {
    const yMap = new Uint8Array(256)
    const cMap = new Uint8Array(256)
    for (let v = 0; v < 256; v++) {
        yMap[v] = clamp8(toFull ? ((v - 16) * 255) / 219 : 16 + (v * 219) / 255)
        cMap[v] = clamp8(toFull ? ((v - 128) * 255) / 224 + 128 : ((v - 128) * 224) / 255 + 128)
    }
    const data = f.data
    const remap = (p: PlaneLayout, rowBytes: number, rows: number, map: Uint8Array): void => {
        for (let y = 0; y < rows; y++) {
            const row = data.subarray(p.offset + y * p.stride, p.offset + y * p.stride + rowBytes)
            for (let x = 0; x < row.length; x++) row[x] = map[row[x]]
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
    const yo = (fullRange ? 0 : 16) + 0.5 // +0.5: rounding
    const cs = fullRange ? 255 : 224
    // Per-channel weights with the 1/255 and the range scale folded in (hot loop: 2 million pixels per 1080p frame).
    const yr = (ys * kr) / 255
    const yg = (ys * kg) / 255
    const yb = (ys * kb) / 255
    const ur = -(cs * kr) / (2 * (1 - kb) * 255)
    const ug = -(cs * kg) / (2 * (1 - kb) * 255)
    const ub = cs / (2 * 255)
    const vr = cs / (2 * 255)
    const vg = -(cs * kg) / (2 * (1 - kr) * 255)
    const vb = -(cs * kb) / (2 * (1 - kr) * 255)
    const evenW = width % 2 === 0
    const evenH = height % 2 === 0
    for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
            if (evenW && evenH) {
                // Whole 2×2 block (every block but the odd edge of odd sizes): unrolled.
                const x = cx * 2
                const y = cy * 2
                const i0 = (y * width + x) * 4
                const i1 = i0 + 4
                const i2 = i0 + width * 4
                const i3 = i2 + 4
                const R0 = rgba[i0], G0 = rgba[i0 + 1], B0 = rgba[i0 + 2]
                const R1 = rgba[i1], G1 = rgba[i1 + 1], B1 = rgba[i1 + 2]
                const R2 = rgba[i2], G2 = rgba[i2 + 1], B2 = rgba[i2 + 2]
                const R3 = rgba[i3], G3 = rgba[i3 + 1], B3 = rgba[i3 + 2]
                const Y0 = yo + yr * R0 + yg * G0 + yb * B0
                const Y1 = yo + yr * R1 + yg * G1 + yb * B1
                const Y2 = yo + yr * R2 + yg * G2 + yb * B2
                const Y3 = yo + yr * R3 + yg * G3 + yb * B3
                const o = y * width + x
                out[o] = Y0 < 0 ? 0 : Y0 > 255 ? 255 : Y0
                out[o + 1] = Y1 < 0 ? 0 : Y1 > 255 ? 255 : Y1
                out[o + width] = Y2 < 0 ? 0 : Y2 > 255 ? 255 : Y2
                out[o + width + 1] = Y3 < 0 ? 0 : Y3 > 255 ? 255 : Y3
                const R = R0 + R1 + R2 + R3
                const G = G0 + G1 + G2 + G3
                const B = B0 + B1 + B2 + B3
                const U = 128.5 + (ur * R + ug * G + ub * B) / 4
                const V = 128.5 + (vr * R + vg * G + vb * B) / 4
                const c = cy * cw + cx
                out[uOff + c] = U < 0 ? 0 : U > 255 ? 255 : U
                out[vOff + c] = V < 0 ? 0 : V > 255 ? 255 : V
                continue
            }
            let u = 0
            let v = 0
            let n = 0
            for (let dy = 0; dy < 2; dy++) {
                const y = cy * 2 + dy
                if (y >= height) break
                for (let dx = 0; dx < 2; dx++) {
                    const x = cx * 2 + dx
                    if (x >= width) break
                    const i = (y * width + x) * 4
                    const R = rgba[i]
                    const G = rgba[i + 1]
                    const B = rgba[i + 2]
                    const Y = yo + yr * R + yg * G + yb * B
                    out[y * width + x] = Y < 0 ? 0 : Y > 255 ? 255 : Y
                    u += ur * R + ug * G + ub * B
                    v += vr * R + vg * G + vb * B
                    n++
                }
            }
            const c = cy * cw + cx
            const U = 128.5 + u / n
            const V = 128.5 + v / n
            out[uOff + c] = U < 0 ? 0 : U > 255 ? 255 : U
            out[vOff + c] = V < 0 ? 0 : V > 255 ? 255 : V
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

/** True for the decoded formats overlays can be blended into directly (planar/semi-planar 4:2:0, 8-bit). */
export function isYuv420(format: VideoPixelFormat | null | undefined): format is 'I420' | 'NV12' {
    return format === 'I420' || format === 'NV12'
}

/** Plane layout of a packed I420 buffer (as produced by `rgbaToI420`). */
export function i420Layout(width: number, height: number): PlaneLayout[] {
    const cw = Math.ceil(width / 2)
    const ch = Math.ceil(height / 2)
    return [
        { offset: 0, stride: width },
        { offset: width * height, stride: cw },
        { offset: width * height + cw * ch, stride: cw },
    ]
}
