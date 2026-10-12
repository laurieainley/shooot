// Fast 4K -> 1080p scaling for the re-encode path. Drawing a 4K VideoFrame onto a 2D canvas costs ~100-240 ms per frame in
// WebKit (iPadOS / Safari: a CPU readback or software scale), against ~20 ms elsewhere. Two ways round it:
//  1. "direct": hand the 4K VideoFrame to a VideoEncoder configured at the output size; the encoder scales it. Verified once
//     per render by `probeDirectScale` (the output must be the right size and show the whole picture, not a crop).
//  2. "webgl": for frames that need overlays drawn on top, scale with a WebGL2 texture draw, then copy into the 2D canvas.
// Anything that fails or is unavailable falls back to the 2D canvas path the engine always had.

/** A source this much larger than the output (and the same shape) is worth scaling without the 2D canvas. */
export function isDownscale(srcW: number, srcH: number, outW: number, outH: number): boolean {
    return srcW >= outW * 1.4 && srcH >= outH * 1.4 && Math.abs(srcW / srcH - outW / outH) < 0.005
}

const PROBE_SRC = { w: 3840, h: 2160 }

/** Encodes one synthetic 4K picture (white top-left / bottom-right, black elsewhere) into a `config`-sized encoder, decodes
 * the result and checks the quadrants are where they should be. Never throws; the reason string says why not. */
export async function probeDirectScale(config: VideoEncoderConfig, srcW = PROBE_SRC.w, srcH = PROBE_SRC.h): Promise<{ ok: true } | { ok: false; reason: string }> {
    const W = config.width
    const H = config.height
    let enc: VideoEncoder | null = null
    let dec: VideoDecoder | null = null
    const decoded: VideoFrame[] = []
    try {
        if (typeof VideoDecoder === 'undefined') return { ok: false, reason: 'no VideoDecoder' }
        // A small quadrant pattern at the real source size, built from I420 so no canvas is involved.
        const ySize = srcW * srcH
        const buf = new Uint8Array(ySize * 1.5)
        for (let y = 0; y < srcH; y++) {
            const top = y < srcH / 2
            const row = y * srcW
            for (let x = 0; x < srcW; x++) buf[row + x] = (x < srcW / 2) === top ? 235 : 16
        }
        buf.fill(128, ySize)
        let failure: unknown = null
        let chunk: { data: Uint8Array; description?: Uint8Array } | null = null
                enc = new VideoEncoder({
            output: (c, meta) => {
                if (chunk) return
                const data = new Uint8Array(c.byteLength)
                c.copyTo(data)
                const d = meta?.decoderConfig?.description
                chunk = { data, ...(d ? { description: new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : (d as ArrayBuffer).slice(0)) } : {}) }
                if (meta?.decoderConfig && (meta.decoderConfig.codedWidth !== undefined && (meta.decoderConfig.codedWidth !== W || meta.decoderConfig.codedHeight !== H))) failure = new Error(`encoder reported ${meta.decoderConfig.codedWidth}x${meta.decoderConfig.codedHeight}`)
            },
            error: (e) => { failure = e },
        })
        enc.configure(config)
        const vf = new VideoFrame(buf, { format: 'I420', codedWidth: srcW, codedHeight: srcH, timestamp: 0, duration: 33333 })
        try { enc.encode(vf, { keyFrame: true }) } finally { vf.close() }
        await enc.flush()
        if (failure) return { ok: false, reason: failure instanceof Error ? failure.message : String(failure) }
        const got = chunk as { data: Uint8Array; description?: Uint8Array } | null
        if (!got?.description) return { ok: false, reason: 'no encoder output' }
        let derr: unknown = null
        dec = new VideoDecoder({ output: (f) => decoded.push(f), error: (e) => { derr = e } })
        dec.configure({ codec: config.codec, codedWidth: W, codedHeight: H, description: got.description })
        dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: got.data }))
        await dec.flush()
        if (derr || decoded.length === 0) return { ok: false, reason: 'probe picture did not decode' }
        const f = decoded[0]
        if (f.displayWidth !== W || f.displayHeight !== H) return { ok: false, reason: `scaled to ${f.displayWidth}x${f.displayHeight}` }
        const planes = new Uint8Array(f.allocationSize())
        const layout = await f.copyTo(planes)
        const stride = layout[0].stride
        const at = (fx: number, fy: number): number => planes[layout[0].offset + Math.floor(fy * H) * stride + Math.floor(fx * W)]
        const tl = at(0.25, 0.25), tr = at(0.75, 0.25), bl = at(0.25, 0.75), br = at(0.75, 0.75)
        const good = tl > 180 && br > 180 && tr < 70 && bl < 70
        return good ? { ok: true } : { ok: false, reason: `picture not scaled as a whole (${tl},${tr},${bl},${br})` }
    } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    } finally {
        for (const f of decoded) f.close()
        if (dec && dec.state !== 'closed') dec.close()
        if (enc && enc.state !== 'closed') enc.close()
    }
}

/** Draws a VideoFrame (or part of it) into a W x H WebGL2 canvas with bilinear filtering: a 2:1 reduction is an exact 2x2 average. */
export class GlScaler {
    readonly canvas: OffscreenCanvas
    private readonly gl: WebGL2RenderingContext
    private readonly rect: WebGLUniformLocation | null

    private constructor(width: number, height: number) {
        this.canvas = new OffscreenCanvas(width, height)
        const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, premultipliedAlpha: false })
        if (!gl) throw new Error('no WebGL2')
        this.gl = gl
        const shader = (type: number, src: string): WebGLShader => {
            const s = gl.createShader(type)!
            gl.shaderSource(s, src)
            gl.compileShader(s)
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
            return s
        }
        const prog = gl.createProgram()!
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; uniform vec4 r; out vec2 uv; void main(){ uv = r.xy + vec2(p.x*0.5+0.5, 0.5-p.y*0.5) * r.zw; gl_Position = vec4(p,0.0,1.0); }'))
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, '#version 300 es\nprecision mediump float; in vec2 uv; uniform sampler2D t; out vec4 o; void main(){ o = texture(t, uv); }'))
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('GL link failed')
        gl.useProgram(prog)
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        const loc = gl.getAttribLocation(prog, 'p')
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
        this.rect = gl.getUniformLocation(prog, 'r')
        gl.viewport(0, 0, width, height)
    }

    /** Null when WebGL2 is unavailable. */
    static create(width: number, height: number): GlScaler | null {
        try { return typeof OffscreenCanvas === 'undefined' ? null : new GlScaler(width, height) } catch { return null }
    }

    /** Draws the source rectangle (sx, sy, sw, sh in frame pixels) of `frame` over the whole canvas. Throws if the context was lost. */
    draw(frame: VideoFrame, sx: number, sy: number, sw: number, sh: number): void {
        const { gl } = this
        if (gl.isContextLost()) throw new Error('WebGL context lost')
        const fw = frame.displayWidth
        const fh = frame.displayHeight
        gl.uniform4f(this.rect, sx / fw, sy / fh, sw / fw, sh / fh)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('WebGL draw failed')
    }

    dispose(): void { this.gl.getExtension('WEBGL_lose_context')?.loseContext() }
}
