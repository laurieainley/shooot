import { describe, expect, it } from 'vitest'
import { decodeBalls, toTensorData } from './ballModel'

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]
const imageData = (w: number, h: number, fill: (i: number) => [number, number, number, number]): ImageData => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set(fill(i), i * 4)
    return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData
}
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

describe('toTensorData', () => {
    it('should lay a 384×384 image out as planar CHW with RGB/255, mean and std', () => {
        const px = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [51, 102, 204, 7]] as [number, number, number, number][]
        // pixel i of the 384×384 image takes colour i % 4 (alpha is ignored)
        const out = toTensorData(imageData(384, 384, (i) => px[i % 4]))
        expect(out).toBeInstanceOf(Float32Array)
        expect(out).toHaveLength(3 * 384 * 384)
        const plane = 384 * 384
        for (let i = 0; i < 4; i++) {
            for (let c = 0; c < 3; c++) {
                expect(out[c * plane + i]).toBeCloseTo((px[i][c] / 255 - MEAN[c]) / STD[c], 5)
            }
        }
        // the last pixel lands at the end of each plane
        expect(out[plane - 1]).toBeCloseTo((px[(plane - 1) % 4][0] / 255 - MEAN[0]) / STD[0], 5)
        expect(out[3 * plane - 1]).toBeCloseTo((px[(plane - 1) % 4][2] / 255 - MEAN[2]) / STD[2], 5)
    })
    it('should refuse an image that is not 384×384', () => {
        expect(() => toTensorData(imageData(2, 2, () => [0, 0, 0, 255]))).toThrow(/384/)
    })
})

describe('decodeBalls', () => {
    const Q = 300, C = 91
    const make = (): { dets: Float32Array; labels: Float32Array } => ({ dets: new Float32Array(Q * 4), labels: new Float32Array(Q * C).fill(-10) })
    it('should return the ball queries above the threshold as boxes in tile pixels', () => {
        const { dets, labels } = make()
        dets.set([0.5, 0.25, 0.1, 0.05], 7 * 4)       // cx, cy, w, h normalised
        labels[7 * C + 37] = 2
        dets.set([0.1, 0.1, 0.1, 0.1], 20 * 4)
        labels[20 * C + 37] = -3                          // sigmoid 0.047: below 0.2
        dets.set([0.9, 0.9, 0.1, 0.1], 30 * 4)
        labels[30 * C + 1] = 8                            // another class
        const out = decodeBalls(dets, labels)
        expect(out).toHaveLength(1)
        expect(out[0].x1).toBeCloseTo((0.5 - 0.05) * 384)
        expect(out[0].x2).toBeCloseTo((0.5 + 0.05) * 384)
        expect(out[0].y1).toBeCloseTo((0.25 - 0.025) * 384)
        expect(out[0].y2).toBeCloseTo((0.25 + 0.025) * 384)
        expect(out[0].score).toBeCloseTo(sigmoid(2), 5)
    })
    it('should honour the threshold and sort by score', () => {
        const { dets, labels } = make()
        labels[3 * C + 37] = 0                            // 0.5
        labels[9 * C + 37] = 1                            // 0.73
        expect(decodeBalls(dets, labels).map((b) => Math.round(b.score * 100))).toEqual([73, 50])
        expect(decodeBalls(dets, labels, 0.6)).toHaveLength(1)
        expect(decodeBalls(dets, labels, 0.9)).toEqual([])
    })
})

import { looksLikeOnnx } from './ballModel'
describe('looksLikeOnnx', () => {
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s.padEnd(32, ' '))
    it('should accept protobuf bytes starting with ir_version', () => {
        expect(looksLikeOnnx(new Uint8Array([0x08, 0x08, 0x12, ...new Array(20).fill(1)]), 'application/octet-stream')).toBe(true)
    })
    it('should reject an HTML page by content type or by its first bytes', () => {
        expect(looksLikeOnnx(new Uint8Array([0x08, ...new Array(20).fill(1)]), 'text/html; charset=utf-8')).toBe(false)
        expect(looksLikeOnnx(enc('<!doctype html><html>'), null)).toBe(false)
        expect(looksLikeOnnx(enc('  \n<html>'), 'application/octet-stream')).toBe(false)
    })
    it('should reject tiny or non-protobuf bodies', () => {
        expect(looksLikeOnnx(new Uint8Array([0x08]), null)).toBe(false)
        expect(looksLikeOnnx(enc('not a model'), null)).toBe(false)
    })
})
