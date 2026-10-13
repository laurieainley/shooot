// WebGPU scaler/compositor (bench experiment #11). Same job as GlScaler: scale a decoded frame to the output size and, when
// the frame has graphics, blend the painted overlay canvas on top, all in one render pass; the result is a VideoFrame made
// straight from the WebGPU OffscreenCanvas. The decoded frame is imported without a copy (importExternalTexture).
// Anything unavailable or failing is reported with a reason and the caller falls back to its normal path.
/* eslint-disable @typescript-eslint/no-explicit-any */

// No @webgpu/types in this project: the few objects used here are typed loosely.
type Gpu = any

const SHADER = /* wgsl */ `
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vid: texture_external;
@group(0) @binding(2) var ovl: texture_2d<f32>;
@group(0) @binding(3) var<uniform> rect: vec4f;
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = vec2f(f32(i & 1u), f32(i >> 1u));
  var o: VOut;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let v = textureSampleBaseClampToEdge(vid, smp, rect.xy + in.uv * rect.zw);
  let o = textureSampleLevel(ovl, smp, in.uv, 0.0);
  return vec4f(v.rgb * (1.0 - o.a) + o.rgb, 1.0);
}`

export type GpuInfo = { vendor?: string; architecture?: string; device?: string; description?: string }

/** Why WebGPU cannot be used here, or null. Pure part of the feature detection (testable). */
export function gpuUnavailableReason(nav: { gpu?: unknown } | undefined, hasOffscreen: boolean): string | null {
    if (!nav?.gpu) return 'navigator.gpu is not available (WebGPU is not enabled in this browser)'
    if (!hasOffscreen) return 'no OffscreenCanvas'
    return null
}

export async function adapterInfo(): Promise<GpuInfo | null> {
    try {
        const gpu = (navigator as any).gpu
        const adapter = await gpu?.requestAdapter()
        if (!adapter) return null
        const i = adapter.info ?? (await adapter.requestAdapterInfo?.())
        return i ? { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description } : {}
    } catch { return null }
}

export type GpuCreate = { scaler: GpuScaler; info: GpuInfo | null } | { scaler: null; reason: string; info: GpuInfo | null }

export class GpuScaler {
    readonly overlayCanvas: OffscreenCanvas
    readonly overlayCtx: OffscreenCanvasRenderingContext2D
    private readonly canvas: OffscreenCanvas
    private readonly device: Gpu
    private readonly ctx: Gpu
    private readonly pipeline: Gpu
    private readonly sampler: Gpu
    private readonly uniform: Gpu
    private readonly overlayTex: Gpu
    private readonly emptyTex: Gpu
    readonly width: number
    readonly height: number
    private lostReason: string | null = null
    private errorText: string | null = null

    private constructor(width: number, height: number, device: Gpu, ctx: Gpu, canvas: OffscreenCanvas, format: string) {
        this.width = width
        this.height = height
        this.device = device
        this.ctx = ctx
        this.canvas = canvas
        this.overlayCanvas = new OffscreenCanvas(width, height)
        const o = this.overlayCanvas.getContext('2d')
        if (!o) throw new Error('no 2D canvas for the overlay')
        this.overlayCtx = o
        const G = (globalThis as any).GPUTextureUsage
        const module = device.createShaderModule({ code: SHADER })
        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module, entryPoint: 'vs' },
            fragment: { module, entryPoint: 'fs', targets: [{ format }] },
            primitive: { topology: 'triangle-strip' },
        })
        this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
        this.uniform = device.createBuffer({ size: 16, usage: (globalThis as any).GPUBufferUsage.UNIFORM | (globalThis as any).GPUBufferUsage.COPY_DST })
        this.overlayTex = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: G.TEXTURE_BINDING | G.COPY_DST | G.RENDER_ATTACHMENT })
        this.emptyTex = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: G.TEXTURE_BINDING | G.COPY_DST })
        device.queue.writeTexture({ texture: this.emptyTex }, new Uint8Array(4), { bytesPerRow: 4 }, [1, 1])
        device.lost.then((i: { reason?: string; message?: string }) => { this.lostReason = `GPU device lost (${i.reason ?? 'unknown'}${i.message ? `: ${i.message}` : ''})` })
        device.addEventListener?.('uncapturederror', (ev: any) => { this.errorText = ev?.error?.message ?? 'GPU error' })
    }

    /** Never throws: a scaler, or the reason there is none. Self-tests one frame so a broken importExternalTexture shows up here. */
    static async create(width: number, height: number): Promise<GpuCreate> {
        const nav = typeof navigator === 'undefined' ? undefined : (navigator as any)
        const why = gpuUnavailableReason(nav, typeof OffscreenCanvas !== 'undefined')
        if (why) return { scaler: null, reason: why, info: null }
        let info: GpuInfo | null = null
        let scaler: GpuScaler | null = null
        try {
            const adapter = await nav.gpu.requestAdapter()
            if (!adapter) return { scaler: null, reason: 'no WebGPU adapter', info }
            const i = adapter.info ?? (await adapter.requestAdapterInfo?.())
            info = i ? { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description } : {}
            const device = await adapter.requestDevice()
            const canvas = new OffscreenCanvas(width, height)
            const ctx = (canvas as any).getContext('webgpu')
            if (!ctx) return { scaler: null, reason: "no 'webgpu' canvas context", info }
            const format = nav.gpu.getPreferredCanvasFormat()
            ctx.configure({ device, format, alphaMode: 'opaque' })
            scaler = new GpuScaler(width, height, device, ctx, canvas, format)
            // Self-test with a small synthetic frame.
            const t = new OffscreenCanvas(64, 36)
            t.getContext('2d')!.fillRect(0, 0, 64, 36)
            const vf = new VideoFrame(t, { timestamp: 0 })
            try {
                const out = scaler.frame(vf, { sx: 0, sy: 0, sw: 64, sh: 36 }, null, 0, 33333)
                out.close()
                await device.queue.onSubmittedWorkDone()
                scaler.check()
            } finally { vf.close() }
            return { scaler, info }
        } catch (e) {
            scaler?.dispose()
            return { scaler: null, reason: e instanceof Error ? e.message : String(e), info }
        }
    }

    private check(): void {
        if (this.lostReason) throw new Error(this.lostReason)
        if (this.errorText) throw new Error(`WebGPU error: ${this.errorText}`)
    }

    /**
     * Scales the (sx, sy, sw, sh) part of `frame` over the whole output; `paint` (if given) draws the overlays on a transparent
     * canvas that is blended on top. Returns a new VideoFrame the caller must close. `frame` is not closed here.
     */
    frame(frame: VideoFrame, r: { sx: number; sy: number; sw: number; sh: number }, paint: ((ctx: OffscreenCanvasRenderingContext2D) => void) | null, timestamp: number, duration: number): VideoFrame {
        this.check()
        const { device } = this
        const fw = frame.displayWidth
        const fh = frame.displayHeight
        device.queue.writeBuffer(this.uniform, 0, new Float32Array([r.sx / fw, r.sy / fh, r.sw / fw, r.sh / fh]))
        let overlay = this.emptyTex
        if (paint) {
            this.overlayCtx.clearRect(0, 0, this.width, this.height)
            paint(this.overlayCtx)
            device.queue.copyExternalImageToTexture({ source: this.overlayCanvas }, { texture: this.overlayTex, premultipliedAlpha: true }, [this.width, this.height])
            overlay = this.overlayTex
        }
        const ext = device.importExternalTexture({ source: frame })
        const bind = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: ext },
                { binding: 2, resource: overlay.createView() },
                { binding: 3, resource: { buffer: this.uniform } },
            ],
        })
        const enc = device.createCommandEncoder()
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] })
        pass.setPipeline(this.pipeline)
        pass.setBindGroup(0, bind)
        pass.draw(4)
        pass.end()
        device.queue.submit([enc.finish()])
        // Must happen in the same task as the submit: the canvas texture expires afterwards.
        return new VideoFrame(this.canvas, { timestamp, duration, alpha: 'discard' })
    }

    dispose(): void {
        try { this.overlayTex.destroy(); this.emptyTex.destroy(); this.device.destroy() } catch { /* already gone */ }
    }
}

/** What the engine holds for experiment #11: the scaler plus per-path counters; any failure turns it off for the rest of the render. */
export class GpuPath {
    frames = 0
    reason: string | null = null
    readonly scaler: GpuScaler
    readonly info: GpuInfo | null
    private constructor(scaler: GpuScaler, info: GpuInfo | null) { this.scaler = scaler; this.info = info }

    /** The path, or null with `note` told why (WebGPU unavailable: the caller keeps its normal path). */
    static async open(width: number, height: number, note: (text: string) => void): Promise<GpuPath | null> {
        const r = await GpuScaler.create(width, height)
        const desc = r.info ? ` [${[r.info.vendor, r.info.architecture, r.info.description].filter(Boolean).join(' ')}]` : ''
        if (!r.scaler) { note(`WebGPU scaling unavailable (${r.reason})${desc}: using the normal scale path`); return null }
        note(`WebGPU scaling on${desc}`)
        return new GpuPath(r.scaler, r.info)
    }

    /** A VideoFrame for this picture, or null (path failed: reason set, normal path takes over from here). */
    tryFrame(sample: { toVideoFrame: () => VideoFrame }, r: { sx: number; sy: number; sw: number; sh: number }, paint: ((ctx: OffscreenCanvasRenderingContext2D) => void) | null, timestamp: number, duration: number, note: (text: string) => void): VideoFrame | null {
        if (this.reason) return null
        const f = sample.toVideoFrame()
        try {
            const out = this.scaler.frame(f, r, paint, timestamp, duration)
            this.frames++
            return out
        } catch (e) {
            this.reason = e instanceof Error ? e.message : String(e)
            note(`WebGPU scaling failed (${this.reason}); using the normal path from here`)
            return null
        } finally { f.close() }
    }

    dispose(): void { this.scaler.dispose() }
}
