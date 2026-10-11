// The 3D ball layer: a full-frame orthographic three.js canvas in pixel units (origin top-left, like CSS),
// so the ball can be placed on the same coordinates as the 2D graphics around it.
import { ThreeCanvas } from '@remotion/three'
import { useMemo } from 'react'
import { AbsoluteFill } from 'remotion'
import { H, W } from '../brand'
import { makeBallMaterial } from './ballMaterial'

export type BallState = {
    x: number
    y: number
    /** Radius in px. */
    r: number
    /** Spin angles (radians). */
    rx: number
    ry: number
    rz: number
    /** 0 = football, 1 = REC red. */
    red: number
    /** Smear along the direction of travel (1 = round). */
    stretch?: number
    /** Direction of travel in radians (screen space, y down). */
    dir?: number
    opacity?: number
}

type BallProps = { state: BallState }

function Ball({ state }: BallProps): React.ReactElement {
    const material = useMemo(() => makeBallMaterial(), [])
    material.uniforms.uRedMix.value = state.red
    // Seams stay a constant screen width-ish: thinner on a big ball.
    material.uniforms.uSeamWidth.value = Math.min(0.012, Math.max(0.0035, 1.6 / Math.max(1, state.r)))
    const stretch = state.stretch ?? 1
    const dir = state.dir ?? 0
    return (
        // Outer group: smear along the travel direction in screen space; inner mesh: spin.
        <group position={[state.x - W / 2, H / 2 - state.y, 0]} rotation={[0, 0, -dir]}>
            <group scale={[state.r * stretch, state.r / Math.sqrt(stretch), state.r]}>
                <group rotation={[0, 0, dir]}>
                    <mesh rotation={[state.rx, state.ry, state.rz]} material={material}>
                        <sphereGeometry args={[1, 96, 64]} />
                    </mesh>
                </group>
            </group>
        </group>
    )
}

export function Ball3DLayer({ balls }: { balls: BallState[] }): React.ReactElement | null {
    const visible = balls.filter((b) => b.r > 0.5 && (b.opacity ?? 1) > 0)
    if (visible.length === 0) return null
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <ThreeCanvas
                width={W}
                height={H}
                orthographic
                camera={{ left: -W / 2, right: W / 2, top: H / 2, bottom: -H / 2, near: -4000, far: 4000, position: [0, 0, 1000], zoom: 1 }}
                gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
                style={{ background: 'transparent' }}
            >
                {visible.map((b, i) => (
                    <Ball key={i} state={b} />
                ))}
            </ThreeCanvas>
        </AbsoluteFill>
    )
}
