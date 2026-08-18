import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { PedStateName } from '../../simulation/pedestrianEngine'

/**
 * Procedural humanoid NPC model.
 *
 * Model sourcing: the openly-licensed humanoid GLBs that are small enough to
 * ship (Khronos glTF-Sample-Assets `CesiumMan`, `RiggedSimple`,
 * `RiggedFigure`) are rigged test mannequins — metallic or naked — that do
 * not look like believable city pedestrians, and the realistic ones
 * (`Michelle` and friends) are tens of megabytes. So, like the vehicles,
 * NPCs are self-authored: a proportions-accurate skeleton (hips → knees →
 * ankles, shoulders → elbows → hands) skinned with low-poly meshes. Every
 * geometry and every material is shared across all NPCs (only per-NPC joints
 * and colour references are unique), so the whole crowd costs a handful of
 * cached assets — no heavy model per NPC.
 */

export interface HumanoidAppearance {
  heightScale: number
  buildScale: number
  shirtColor: string
  pantsColor: string
  skinColor: string
  hairColor: string
  shoeColor: string
  shortSleeves: boolean
  hasHair: boolean
  style: 'casual' | 'business' | 'sporty'
}

export interface HumanoidRig {
  group: THREE.Group
  pelvis: THREE.Group
  chest: THREE.Group
  head: THREE.Group
  shoulderL: THREE.Group
  shoulderR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  hipL: THREE.Group
  hipR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  ankleL: THREE.Group
  ankleR: THREE.Group
  appearance: HumanoidAppearance
  shirtMat: THREE.MeshStandardMaterial
  pantsMat: THREE.MeshStandardMaterial
  skinMat: THREE.MeshStandardMaterial
}

export interface PedPoseInput {
  state: PedStateName
  phase: number
  speed: number
  time: number
  /** signed turn rate (rad/s) — for leaning into turns */
  yawRate?: number
  /** 0..1 how strongly the pedestrian is striding (crowd-adjusted speed) */
  intensity?: number
}

/* -------------------------------------------------------------------------
 * Shared asset caches.
 * ---------------------------------------------------------------------- */

const geometryCache = new Map<string, THREE.BufferGeometry>()
const materialCache = new Map<string, THREE.MeshStandardMaterial>()

const geo = (key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
  let g = geometryCache.get(key)
  if (!g) {
    g = make()
    geometryCache.set(key, g)
  }
  return g
}

const mat = (type: string, color: string): THREE.MeshStandardMaterial => {
  const key = `${type}|${color}`
  let m = materialCache.get(key)
  if (!m) {
    const base =
      type === 'shirt'
        ? { roughness: 0.7 }
        : type === 'pants'
          ? { roughness: 0.85 }
          : type === 'skin'
            ? { roughness: 0.55 }
            : type === 'hair'
              ? { roughness: 0.5 }
              : { roughness: 0.4 } // shoes
    m = new THREE.MeshStandardMaterial({ color, ...base })
    materialCache.set(key, m)
  }
  return m
}

function cylinder(r: number, h: number, segments = 10): THREE.BufferGeometry {
  return geo(`cyl:${r}:${h}`, () => new THREE.CylinderGeometry(r, r * 0.82, h, segments))
}

function sphere(r: number): THREE.BufferGeometry {
  return geo(`sph:${r}`, () => new THREE.SphereGeometry(r, 16, 14))
}

function roundedBox(w: number, h: number, d: number, radius: number): THREE.BufferGeometry {
  return geo(`rb:${w}:${h}:${d}:${radius}`, () => new RoundedBoxGeometry(w, h, d, 3, radius))
}

/* -------------------------------------------------------------------------
 * Clothing palettes.
 * ---------------------------------------------------------------------- */

const SHIRT_COLORS = [
  '#e11d48',
  '#2563eb',
  '#0d9488',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#16a34a',
  '#b45309',
  '#0f766e',
  '#4f46e5',
  '#be123c',
  '#ca8a04',
  '#1d4ed8',
  '#c026d3',
  '#15803d',
  '#9a3412',
]
const PANTS_COLORS = ['#1f2937', '#334155', '#374151', '#4b5563', '#57534e', '#1e3a5f', '#3f3f46', '#52525b']
const SKIN_COLORS = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5d3a1a', '#a5673f', '#d0a17e']
const HAIR_COLORS = ['#0b0b0b', '#1f1409', '#3e2c20', '#6b4a2f', '#d9a066', '#2b2b2b', '#a52a2a', '#141414']
const SHOE_COLORS = ['#1a1a1a', '#2f2f2f', '#4a3728', '#3b3b3b', '#111827']

/** Deterministic appearance derived from an NPC index. */
export function makeAppearance(index: number): HumanoidAppearance {
  let a = (index * 0x9e3779b1) >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const style = (['casual', 'business', 'sporty'] as const)[Math.floor(rnd() * 3)]
  return {
    heightScale: 0.95 + rnd() * 0.12, // 0.95..1.07
    buildScale: 0.9 + rnd() * 0.24, // 0.90..1.14
    shirtColor: SHIRT_COLORS[Math.floor(rnd() * SHIRT_COLORS.length)],
    pantsColor: PANTS_COLORS[Math.floor(rnd() * PANTS_COLORS.length)],
    skinColor: SKIN_COLORS[Math.floor(rnd() * SKIN_COLORS.length)],
    hairColor: HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)],
    shoeColor: SHOE_COLORS[Math.floor(rnd() * SHOE_COLORS.length)],
    shortSleeves: rnd() < 0.4,
    hasHair: rnd() < 0.85,
    style,
  }
}

/**
 * Build one humanoid rig. All meshes share cached geometries; all materials
 * come from the global pools, so NPCs only own their joints and transforms.
 */
export function buildHumanoidRig(index: number): HumanoidRig {
  const app = makeAppearance(index)
  const shirtMat = mat('shirt', app.shirtColor)
  const pantsMat = mat('pants', app.pantsColor)
  const skinMat = mat('skin', app.skinColor)
  const hairMat = mat('hair', app.hairColor)
  const shoeMat = mat('shoe', app.shoeColor)

  const group = new THREE.Group()
  group.scale.set(app.buildScale, app.heightScale, app.buildScale)

  // -- pelvis / hips --------------------------------------------------------
  const pelvis = new THREE.Group()
  pelvis.position.y = 0.94
  group.add(pelvis)

  const pelvisMesh = new THREE.Mesh(roundedBox(0.34, 0.16, 0.19, 0.04), pantsMat)
  pelvis.add(pelvisMesh)

  const makeLeg = (side: 1 | -1) => {
    const hip = new THREE.Group()
    hip.position.set(0.1 * side, 0, 0)
    pelvis.add(hip)

    const thigh = new THREE.Mesh(cylinder(0.085, 0.46), pantsMat)
    thigh.position.y = -0.23
    hip.add(thigh)

    const knee = new THREE.Group()
    knee.position.y = -0.46
    hip.add(knee)

    const shin = new THREE.Mesh(cylinder(0.07, 0.42), pantsMat)
    shin.position.y = -0.21
    knee.add(shin)

    const ankle = new THREE.Group()
    ankle.position.y = -0.42
    knee.add(ankle)

    const foot = new THREE.Mesh(roundedBox(0.1, 0.07, 0.26, 0.02), shoeMat)
    foot.position.set(0.02, -0.025, 0.06)
    ankle.add(foot)

    return { hip, knee, ankle }
  }

  const legL = makeLeg(-1)
  const legR = makeLeg(1)

  // -- torso ----------------------------------------------------------------
  const spine = new THREE.Group()
  spine.position.y = 0.06
  pelvis.add(spine)

  const chest = new THREE.Group()
  chest.position.y = 0.23
  spine.add(chest)

  const torso = new THREE.Mesh(roundedBox(0.42, 0.44, 0.2, 0.05), shirtMat)
  torso.position.y = 0.0
  chest.add(torso)

  // -- head -----------------------------------------------------------------
  const neck = new THREE.Group()
  neck.position.y = 0.19
  chest.add(neck)

  const head = new THREE.Group()
  head.position.y = 0.13
  neck.add(head)

  const headMesh = new THREE.Mesh(sphere(0.115), skinMat)
  head.add(headMesh)
  if (app.hasHair) {
    const hair = new THREE.Mesh(
      geo('hair', () => new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      hairMat
    )
    hair.position.y = 0.008
    head.add(hair)
  }

  // -- arms -----------------------------------------------------------------
  const makeArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(0.21 * side, 0.17, 0)
    chest.add(shoulder)

    const upperArm = new THREE.Mesh(cylinder(0.055, 0.3), shirtMat)
    upperArm.position.y = -0.15
    shoulder.add(upperArm)

    const elbow = new THREE.Group()
    elbow.position.y = -0.3
    shoulder.add(elbow)

    const forearm = new THREE.Mesh(cylinder(0.048, 0.27), app.shortSleeves ? skinMat : shirtMat)
    forearm.position.y = -0.135
    elbow.add(forearm)

    const hand = new THREE.Group()
    hand.position.y = -0.27
    elbow.add(hand)

    const handMesh = new THREE.Mesh(sphere(0.05), skinMat)
    hand.add(handMesh)

    return { shoulder, elbow, hand }
  }

  const armL = makeArm(-1)
  const armR = makeArm(1)

  // Only the big silhouette parts cast shadows — limb/head small parts add
  // shadow-pass draw calls with no visible benefit.
  for (const part of [pelvisMesh, torso, headMesh]) part.castShadow = true

  return {
    group,
    pelvis,
    chest,
    head,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    ankleL: legL.ankle,
    ankleR: legR.ankle,
    appearance: app,
    shirtMat,
    pantsMat,
    skinMat,
  }
}

/* -------------------------------------------------------------------------
 * Poses.
 * ---------------------------------------------------------------------- */

function resetLimbs(r: HumanoidRig): void {
  r.pelvis.position.y = 0.94
  r.pelvis.rotation.set(0, 0, 0)
  r.chest.position.y = 0.23
  r.chest.rotation.set(0, 0, 0)
  r.chest.scale.set(1, 1, 1)
  r.head.rotation.set(0, 0, 0)
  for (const j of [
    r.shoulderL,
    r.shoulderR,
    r.elbowL,
    r.elbowR,
    r.hipL,
    r.hipR,
    r.kneeL,
    r.kneeR,
    r.ankleL,
    r.ankleR,
  ]) {
    j.rotation.set(0, 0, 0)
  }
}

function walkPose(r: HumanoidRig, phase: number, intensity: number): void {
  const amp = Math.max(0, Math.min(1, intensity))
  resetLimbs(r)
  r.pelvis.position.y = 0.94 + Math.abs(Math.sin(phase)) * 0.026 * amp
  r.pelvis.rotation.x = 0.06 * amp
  r.pelvis.rotation.z = Math.sin(phase) * 0.03 * amp
  r.chest.rotation.z = Math.sin(phase) * 0.03 * amp
  r.chest.rotation.x = -0.04 * amp

  r.hipL.rotation.x = Math.sin(phase) * 0.5 * amp
  r.hipR.rotation.x = -Math.sin(phase) * 0.5 * amp
  r.kneeL.rotation.x = Math.max(0, Math.sin(phase)) * 0.55 * amp
  r.kneeR.rotation.x = Math.max(0, -Math.sin(phase)) * 0.55 * amp
  r.ankleL.rotation.x = -r.kneeL.rotation.x * 0.35
  r.ankleR.rotation.x = -r.kneeR.rotation.x * 0.35

  r.shoulderL.rotation.x = -Math.sin(phase) * 0.38 * amp
  r.shoulderR.rotation.x = Math.sin(phase) * 0.38 * amp
  r.shoulderL.rotation.z = -0.06 * amp
  r.shoulderR.rotation.z = 0.06 * amp
  r.elbowL.rotation.x = 0.22 * amp
  r.elbowR.rotation.x = 0.22 * amp
}

function idlePose(r: HumanoidRig, time: number): void {
  resetLimbs(r)
  r.pelvis.rotation.z = Math.sin(time * 0.7) * 0.025
  r.chest.scale.y = 1 + Math.sin(time * 1.7) * 0.012 // breathing
  r.head.rotation.y = Math.sin(time * 0.5) * 0.25
  r.head.rotation.x = Math.sin(time * 0.9) * 0.04
  r.shoulderL.rotation.set(0.05, 0, -0.05)
  r.shoulderR.rotation.set(0.05, 0, 0.05)
  r.elbowL.rotation.x = 0.12
  r.elbowR.rotation.x = 0.12
  r.kneeL.rotation.x = 0.04
  r.kneeR.rotation.x = 0.04
}

function waitingPose(r: HumanoidRig, time: number): void {
  idlePose(r, time)
  // Scanning for traffic: look left and right at the crosswalk.
  r.head.rotation.y = Math.sin(time * 1.1) * 0.7
  r.head.rotation.x = 0
  r.pelvis.rotation.z = Math.sin(time * 0.9) * 0.02
  r.kneeL.rotation.x = 0.08 + Math.max(0, Math.sin(time * 0.9)) * 0.05
}

function avoidingPose(r: HumanoidRig): void {
  resetLimbs(r)
  r.pelvis.rotation.x = -0.1 // lean back
  r.chest.rotation.x = -0.04
  r.head.rotation.x = -0.12 // look at the threat
  r.shoulderL.rotation.z = -0.3
  r.shoulderR.rotation.z = 0.3
  r.shoulderL.rotation.x = -0.15
  r.shoulderR.rotation.x = -0.15
  r.elbowL.rotation.x = 0.3
  r.elbowR.rotation.x = 0.3
  r.hipL.rotation.x = 0.05
  r.hipR.rotation.x = 0.05
  r.kneeL.rotation.x = 0.05
  r.kneeR.rotation.x = 0.05
}

function turningPose(r: HumanoidRig, time: number, yawRate: number): void {
  idlePose(r, time)
  // Pivot in place and lean slightly into the turn.
  const lean = Math.max(-1, Math.min(1, yawRate)) * -0.08
  r.pelvis.rotation.z = lean + Math.sin(time * 10) * 0.02
  r.chest.rotation.y = lean * 1.5
  r.hipL.rotation.x = Math.sin(time * 10) * 0.12
  r.hipR.rotation.x = -Math.sin(time * 10) * 0.12
  r.shoulderL.rotation.z = -0.12
  r.shoulderR.rotation.z = 0.12
}

/** Apply a pose for one frame of animation. Deterministic given inputs. */
export function applyPose(r: HumanoidRig, input: PedPoseInput): void {
  const walking = (input.state === 'WALKING' || input.state === 'CROSSING') && input.speed > 0.05
  if (walking) {
    walkPose(r, input.phase, input.intensity ?? 1)
  } else if (input.state === 'WAITING') {
    waitingPose(r, input.time)
  } else if (input.state === 'AVOIDING') {
    avoidingPose(r)
  } else if (input.state === 'TURNING') {
    turningPose(r, input.time, input.yawRate ?? 0)
  } else {
    idlePose(r, input.time)
  }
}
