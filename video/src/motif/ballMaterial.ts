// A stylised football as a shader: the panels of a truncated icosahedron projected onto a sphere (each point belongs
// to the face whose plane the ray from the centre hits first), dark pentagons, chalk hexagons, lime seams.
// `uRed` blends the whole ball to the REC red (the dot it was, and becomes again).
import * as THREE from 'three'
import { C } from '../brand'

const PHI = (1 + Math.sqrt(5)) / 2

function icosaVertices(): THREE.Vector3[] {
    const v: THREE.Vector3[] = []
    for (const a of [-1, 1]) for (const b of [-PHI, PHI]) {
        v.push(new THREE.Vector3(0, a, b), new THREE.Vector3(a, b, 0), new THREE.Vector3(b, 0, a))
    }
    return v.map((p) => p.normalize())
}

function icosaFaceCentres(verts: THREE.Vector3[]): THREE.Vector3[] {
    const edge = verts[0].distanceTo(verts.reduce((best, p) => (p !== verts[0] && p.distanceTo(verts[0]) < best.distanceTo(verts[0]) ? p : best), verts[1]))
    const near = (a: THREE.Vector3, b: THREE.Vector3): boolean => Math.abs(a.distanceTo(b) - edge) < 1e-3
    const out: THREE.Vector3[] = []
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) for (let k = j + 1; k < verts.length; k++) {
        if (near(verts[i], verts[j]) && near(verts[j], verts[k]) && near(verts[i], verts[k])) {
            out.push(verts[i].clone().add(verts[j]).add(verts[k]).normalize())
        }
    }
    return out
}

const PENT = icosaVertices()
const HEX = icosaFaceCentres(PENT)

const hex = (c: string): THREE.Color => new THREE.Color(c).convertSRGBToLinear()

const vertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
    vObj = normalize(position);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}
`

const fragment = /* glsl */ `
uniform vec3 uPent[12];
uniform vec3 uHex[20];
uniform vec3 uDark;
uniform vec3 uChalk;
uniform vec3 uSeam;
uniform vec3 uRed;
uniform float uRedMix;
uniform float uSeamWidth;
uniform vec3 uKey;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewDir;

// Inradius ratios of a truncated icosahedron (edge 1): pentagon 2.32744, hexagon 2.26728.
const float RP = 1.0 / 2.32744;
const float RH = 1.0 / 2.26728;

void main() {
    vec3 p = normalize(vObj);
    float best = -1.0; float second = -1.0; float isPent = 0.0;
    for (int i = 0; i < 12; i++) {
        float s = dot(p, uPent[i]) * RP;
        if (s > best) { second = best; best = s; isPent = 1.0; } else if (s > second) { second = s; }
    }
    for (int i = 0; i < 20; i++) {
        float s = dot(p, uHex[i]) * RH;
        if (s > best) { second = best; best = s; isPent = 0.0; } else if (s > second) { second = s; }
    }
    float edge = best - second;
    float aa = fwidth(edge) * 1.2;
    float seam = 1.0 - smoothstep(uSeamWidth - aa, uSeamWidth + aa, edge);
    vec3 panel = mix(uChalk, uDark, isPent);
    vec3 base = mix(panel, uSeam, seam);
    // Panels are slightly domed: darken a touch towards the seams for a stitched look.
    base *= mix(0.86, 1.0, smoothstep(0.0, 0.05, edge));
    base = mix(base, uRed, uRedMix);

    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewDir);
    vec3 l = normalize(uKey);
    float diff = max(dot(n, l), 0.0);
    float wrap = max((dot(n, l) + 0.35) / 1.35, 0.0);
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), 48.0) * (1.0 - isPent * 0.4) * (1.0 - uRedMix * 0.5);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = base * (0.22 + 0.62 * wrap + 0.22 * diff) + vec3(spec) * 0.55;
    // Subtle cool rim from behind (stadium light), never a glow.
    col += vec3(0.62, 0.70, 0.66) * fres * 0.28 * (1.0 - uRedMix);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`

export function makeBallMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
            uPent: { value: PENT },
            uHex: { value: HEX },
            uDark: { value: hex('#161d19') },
            uChalk: { value: hex(C.chalk) },
            uSeam: { value: hex(C.lime) },
            uRed: { value: hex(C.rec) },
            uRedMix: { value: 0 },
            uSeamWidth: { value: 0.0065 },
            uKey: { value: new THREE.Vector3(-0.5, 0.7, 0.8) },
        },
    })
}
