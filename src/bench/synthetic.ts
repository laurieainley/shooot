// A test clip made in the browser (moving pattern, tone, H.264 + AAC), for devices with no footage on them.
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output } from 'mediabunny'

export type SyntheticSpec = { label: string; width: number; height: number; seconds: number; fps: number; bitrate: number }

export const SYNTHETIC: SyntheticSpec[] = [
    { label: 'Synthetic 1080p 30 s', width: 1920, height: 1080, seconds: 30, fps: 30, bitrate: 15e6 },
    { label: 'Synthetic 4K 30 s', width: 3840, height: 2160, seconds: 30, fps: 30, bitrate: 40e6 },
]

/** Encodes the clip on the spot (a moving pitch-like pattern with a frame counter, so the encoders have real work). */
export async function makeSyntheticClip(spec: SyntheticSpec, onProgress: (f: number) => void): Promise<File> {
    const { width: W, height: H, fps, seconds } = spec
    const canvas = new OffscreenCanvas(W, H)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2D canvas')
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat(), target })
    const video = new CanvasSource(canvas, { codec: 'avc', bitrate: spec.bitrate, keyFrameInterval: 1 })
    output.addVideoTrack(video, { frameRate: fps })
    const audio = new AudioBufferSource({ codec: 'aac', bitrate: 128_000 })
    output.addAudioTrack(audio)
    await output.start()
    const rate = 48000
    const tone = new AudioBuffer({ length: rate * seconds, numberOfChannels: 2, sampleRate: rate })
    for (let c = 0; c < 2; c++) {
        const d = tone.getChannelData(c)
        for (let i = 0; i < d.length; i++) d[i] = 0.1 * Math.sin((2 * Math.PI * (220 + 110 * c) * i) / rate)
    }
    await audio.add(tone)
    const n = Math.round(seconds * fps)
    for (let i = 0; i < n; i++) {
        const t = i / fps
        const g = ctx.createLinearGradient(0, 0, W, H)
        g.addColorStop(0, `hsl(${(t * 20) % 360} 55% 28%)`)
        g.addColorStop(1, `hsl(${(t * 20 + 90) % 360} 60% 38%)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        ctx.strokeStyle = 'rgba(255,255,255,.7)'
        ctx.lineWidth = Math.max(2, H / 270)
        for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo((x * W) / 10, 0); ctx.lineTo((x * W) / 10, H); ctx.stroke() }
        ctx.beginPath(); ctx.arc(W / 2, H / 2, H / 5, 0, 2 * Math.PI); ctx.stroke()
        // Detail that moves (so the encoder cannot just repeat blocks).
        for (let k = 0; k < 60; k++) {
            const x = ((k * 97 + i * (4 + (k % 7))) % W)
            const y = ((k * 53 + i * (2 + (k % 5))) % H)
            ctx.fillStyle = `hsl(${(k * 37 + i) % 360} 70% 60%)`
            ctx.fillRect(x, y, H / 18, H / 18)
        }
        ctx.fillStyle = '#fff'
        ctx.font = `${Math.round(H / 8)}px sans-serif`
        ctx.fillText(`${t.toFixed(2)} s  #${i}`, W * 0.08, H * 0.2)
        await video.add(t, 1 / fps)
        if (i % 30 === 0) onProgress(i / n)
    }
    await output.finalize()
    return new File([target.buffer!], `${spec.label.replace(/\W+/g, '-').toLowerCase()}.mp4`, { type: 'video/mp4' })
}
