// Pre/post-processing for the RF-DETR-nano ball model (recipe from spikes/rfdetr-web/REPORT.md).
import type { Box } from '../utils/ballSampling'

export const TILE_SIZE = 384
export const QUERIES = 300
export const CLASSES = 91
/** COCO "sports ball". */
export const BALL_CLASS = 37
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]

/** 384×384 RGBA pixels to the model input: RGB/255, ImageNet mean/std, planar CHW (length 3·384·384). */
export function toTensorData(img: ImageData): Float32Array {
    if (img.width !== TILE_SIZE || img.height !== TILE_SIZE) throw new Error(`Ball model input must be ${TILE_SIZE}×${TILE_SIZE}.`)
    const plane = TILE_SIZE * TILE_SIZE, out = new Float32Array(3 * plane), d = img.data
    for (let i = 0; i < plane; i++) {
        for (let c = 0; c < 3; c++) out[c * plane + i] = (d[i * 4 + c] / 255 - MEAN[c]) / STD[c]
    }
    return out
}

/**
 * Ball detections of one tile. `dets` = [300,4] (cx, cy, w, h normalised to the tile), `labels` = [300,91] logits.
 * Score = sigmoid(logit of class 37); kept when ≥ threshold; no NMS; best first; boxes in 384-px tile coordinates.
 */
export function decodeBalls(dets: Float32Array, labels: Float32Array, threshold = 0.2): Box[] {
    const out: Box[] = []
    for (let q = 0; q < QUERIES; q++) {
        const score = 1 / (1 + Math.exp(-labels[q * CLASSES + BALL_CLASS]))
        if (score < threshold) continue
        const cx = dets[q * 4] * TILE_SIZE, cy = dets[q * 4 + 1] * TILE_SIZE, w = dets[q * 4 + 2] * TILE_SIZE, h = dets[q * 4 + 3] * TILE_SIZE
        out.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, score })
    }
    return out.sort((a, b) => b.score - a.score)
}

/** Is this response a model file? An SPA fallback answers 200 with an HTML page instead. */
export function looksLikeOnnx(bytes: Uint8Array, contentType: string | null): boolean {
    if (contentType && /text\/html/i.test(contentType)) return false
    if (bytes.length < 16) return false
    let i = 0
    while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09 || bytes[i] === 0xef || bytes[i] === 0xbb || bytes[i] === 0xbf)) i++
    if (bytes[i] === 0x3c) return false // "<"
    return bytes[0] === 0x08 // ONNX ModelProto starts with field 1 (ir_version), varint tag 0x08
}
