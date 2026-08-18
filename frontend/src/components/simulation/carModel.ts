import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural, openly-licensed (self-authored) city-car models.
 *
 * Why not a downloaded GLB? The openly-licensed car GLBs we could source
 * (Khronos ToyCar ~5.4 MB, CarConcept ~11 MB, three.js `ferrari.glb` with no
 * license attribution) all violate the "small / clearly licensed" constraints.
 * A hand-built car rig is:
 *   - fully CC0-style (no third-party rights, no attribution burden)
 *   - tiny (shared geometries + materials, ~15 draw calls per car)
 *   - perfectly suited to the engine's conventions: front = +Z (matches
 *     `rotation.y = heading`), origin on the ground at the car centre, and a
 *     hierarchy that exposes each wheel's steering pivot and rolling axle so
 *     the visual layer can drive them from actual physics.
 *
 * Conventions
 *   - Local space: front = +Z, right = +X, up = +Y, origin at ground level
 *     under the car centre.
 *   - Wheel rig per corner: `steer` pivots around Y (front corners), `roll`
 *     spins around X (the axle). A wheel rolled by `rotation.x` inside a
 *     steering group whose `rotation.y` is the steering angle stays correct.
 *   - All geometries and non-instance materials are cached and shared across
 *     every car; only the brake / turn-signal materials are per-instance so
 *     their emissive intensity can be driven independently.
 */

export type CarVariantKind = 'sedan' | 'hatchback' | 'suv'

export interface CarVariantSpec {
  kind: CarVariantKind
  /** Overall length (bumper to bumper), metres. */
  length: number
  /** Body width, metres. */
  width: number
  /** Overall height (roof), metres. */
  height: number
  /** Front ↔ rear axle distance, metres. */
  wheelbase: number
  /** Lateral distance between wheel centres, metres. */
  track: number
  /** Tyre radius, metres (drives wheel-roll distance conversion). */
  wheelRadius: number
  /** Bottom of the body above the road, metres. */
  groundClearance: number
  /** Height of the beltline (base of the windows), metres. */
  beltline: number
  /** Roof height above the road, metres. */
  roofY: number
  cabinLength: number
  cabinWidth: number
  cabinCenterZ: number
  fenderSize: [number, number, number]
}

export const CAR_VARIANTS: Record<CarVariantKind, CarVariantSpec> = {
  sedan: {
    kind: 'sedan',
    length: 4.2,
    width: 1.84,
    height: 1.42,
    wheelbase: 2.68,
    track: 1.56,
    wheelRadius: 0.34,
    groundClearance: 0.14,
    beltline: 0.7,
    roofY: 1.4,
    cabinLength: 2.05,
    cabinWidth: 1.62,
    cabinCenterZ: -0.06,
    fenderSize: [0.42, 0.3, 0.88],
  },
  hatchback: {
    kind: 'hatchback',
    length: 4.05,
    width: 1.78,
    height: 1.5,
    wheelbase: 2.5,
    track: 1.5,
    wheelRadius: 0.33,
    groundClearance: 0.13,
    beltline: 0.72,
    roofY: 1.47,
    cabinLength: 2.15,
    cabinWidth: 1.6,
    cabinCenterZ: -0.18,
    fenderSize: [0.42, 0.3, 0.85],
  },
  suv: {
    kind: 'suv',
    length: 4.55,
    width: 1.9,
    height: 1.72,
    wheelbase: 2.72,
    track: 1.62,
    wheelRadius: 0.37,
    groundClearance: 0.21,
    beltline: 0.82,
    roofY: 1.68,
    cabinLength: 2.35,
    cabinWidth: 1.72,
    cabinCenterZ: -0.14,
    fenderSize: [0.48, 0.34, 1.0],
  },
}

/** Metallic-looking paint palette; pooled per colour so cars share materials. */
export const CAR_BODY_COLORS: string[] = [
  '#c0182b', // crimson
  '#1f4f9e', // royal blue
  '#2e7d32', // green
  '#c98a12', // amber / gold
  '#1c1c22', // black
  '#e3e4ea', // silver
  '#5e6b7a', // slate grey
  '#8a3ab6', // purple
  '#0f766e', // teal
  '#b45309', // bronze
]

/* -------------------------------------------------------------------------- *
 * Shared material pool
 * -------------------------------------------------------------------------- */

function paintMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.45,
    roughness: 0.35,
    envMapIntensity: 1.1,
  })
}

function glassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#0d1728',
    metalness: 0.9,
    roughness: 0.06,
    transparent: true,
    opacity: 0.92,
  })
}

function tireMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.92, metalness: 0.05 })
}

function rimMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#c7ccd5', metalness: 0.9, roughness: 0.28 })
}

function trimMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#27292e', roughness: 0.65, metalness: 0.2 })
}

function headlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#fff8e0',
    emissive: '#ffedb0',
    emissiveIntensity: HEADLIGHT_DAY,
    roughness: 0.2,
    metalness: 0.1,
  })
}

function brakeLightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#d41f1f',
    emissive: '#ff3b30',
    emissiveIntensity: RUNNING_LIGHT_DAY,
    roughness: 0.4,
    metalness: 0.1,
  })
}

function turnIndicatorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#ffb020',
    emissiveIntensity: TURN_INDICATOR_OFF,
    roughness: 0.35,
    metalness: 0.1,
  })
}

function beamMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: '#fff1b0',
    transparent: true,
    opacity: 0.11,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/* Light intensities (shared by carModel + tests). */
export const HEADLIGHT_DAY = 0.0
export const HEADLIGHT_NIGHT = 1.9
export const RUNNING_LIGHT_DAY = 0.35
export const RUNNING_LIGHT_NIGHT = 1.3
export const BRAKE_LIGHT_ON = 3.2
export const TURN_INDICATOR_ON = 2.6
export const TURN_INDICATOR_OFF = 0.0
/** Max front-wheel steering angle in radians (~31°). */
export const MAX_STEER_ANGLE = 0.55

/* -------------------------------------------------------------------------- *
 * Geometry caches
 * -------------------------------------------------------------------------- */

const variantGeoCache = new Map<string, THREE.BufferGeometry>()
const wheelGeoCache = new Map<string, THREE.BufferGeometry>()
const smallGeoCache = new Map<string, THREE.BufferGeometry>()
const bodyMatCache = new Map<string, THREE.MeshStandardMaterial>()
const beamMatCache = new Map<string, THREE.MeshBasicMaterial>()

function cached<V>(map: Map<string, V>, key: string, build: () => V): V {
  let v = map.get(key)
  if (!v) {
    v = build()
    map.set(key, v)
  }
  return v
}

function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const segs = Math.max(2, Math.round(6 * (r / 0.15)))
  return cached(smallGeoCache, `rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, segs, r))
}

function smallBox(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(smallGeoCache, `box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d))
}

function tireGeometry(radius: number): THREE.BufferGeometry {
  return cached(wheelGeoCache, `tire:${radius}`, () => new THREE.CylinderGeometry(radius, radius, 0.24, 22))
}

function rimGeometry(radius: number): THREE.BufferGeometry {
  return cached(
    wheelGeoCache,
    `rim:${radius}`,
    () => new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.28, 14),
  )
}

/** Merge several positioned geometries into one; null on any incompatibility. */
function tryMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 1) return parts[0]
  try {
    const merged = mergeGeometries(parts, false)
    return merged ?? null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- *
 * Rig
 * -------------------------------------------------------------------------- */

export interface CarWheel {
  /** Pivots around Y — steering. Front corners only; rear corners self-reference. */
  steer: THREE.Object3D
  /** Spins around X — the axle; driven by actual distance travelled. */
  roll: THREE.Object3D
}

export interface CarRig {
  group: THREE.Group
  /** [frontLeft, frontRight, rearLeft, rearRight]. */
  wheels: CarWheel[]
  /** Per-instance rear running/brake light material. */
  brakeMat: THREE.MeshStandardMaterial
  /** Per-instance left / right turn-indicator materials. */
  turnMatL: THREE.MeshStandardMaterial
  turnMatR: THREE.MeshStandardMaterial
  /** Shared headlight material (night intensity). */
  headMat: THREE.MeshStandardMaterial
  /** Fake headlight-beam cones shown at night (no real lights = cheap). */
  beams: THREE.Object3D[]
  variant: CarVariantKind
  bodyColor: string
  /** Applied scale (visual variety). */
  scale: number
  /** Effective tyre radius including scale — distance→roll conversion. */
  wheelRadius: number
  /** Effective wheelbase including scale — curvature→steer conversion. */
  wheelbase: number
  /** Effective overall length including scale. */
  bodyLength: number
}

export interface BuildCarOpts {
  variant: CarVariantKind
  color: string
  /** Visual size variation (applied uniformly). */
  scale?: number
}

function getBodyMaterial(color: string): THREE.MeshStandardMaterial {
  return cached(bodyMatCache, color, () => paintMaterial(color))
}

export function buildCarRig(opts: BuildCarOpts): CarRig {
  const spec = CAR_VARIANTS[opts.variant]
  const scale = opts.scale ?? 1
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  group.userData.variant = opts.variant

  const bodyMat = getBodyMaterial(opts.color)
  const glassMat = cached(bodyMatCache, '__glass__', glassMaterial)
  const tireMat = cached(bodyMatCache, '__tire__', tireMaterial)
  const rimMat = cached(bodyMatCache, '__rim__', rimMaterial)
  const trimMat = cached(bodyMatCache, '__trim__', trimMaterial)
  const headMat = cached(bodyMatCache, '__head__', headlightMaterial)
  const brakeMat = brakeLightMaterial()
  const turnMatL = turnIndicatorMaterial()
  const turnMatR = turnIndicatorMaterial()
  const beamMat = cached(beamMatCache, 'beam', beamMaterial)

  const { length: L, width: W, wheelbase: WB, track: TR, wheelRadius: R } = spec
  const frontZ = WB / 2
  const rearZ = -WB / 2

  /* --- body (merged, static, shared per variant) --- */
  const bodyGeo = cached(variantGeoCache, `${opts.variant}:body`, () => {
    const bodyH = spec.beltline - spec.groundClearance
    const parts: THREE.BufferGeometry[] = []
    // Main tub (full width, beltline to clearance).
    const tub = roundedBox(W, bodyH, L, 0.16)
    tub.translate(0, spec.groundClearance + bodyH / 2, 0)
    parts.push(tub)
    // Hood (sloped slightly toward the front) and trunk lid.
    const hood = roundedBox(W * 0.94, 0.14, 0.92, 0.1)
    hood.rotateX(0.045)
    hood.translate(0, spec.beltline + 0.05, L / 2 - 0.55)
    parts.push(hood)
    const trunk = roundedBox(W * 0.94, 0.14, 0.82, 0.1)
    trunk.rotateX(-0.05)
    trunk.translate(0, spec.beltline + 0.045, -L / 2 + 0.5)
    parts.push(trunk)
    // Roof panel over the greenhouse.
    const roof = roundedBox(spec.cabinWidth - 0.03, 0.08, spec.cabinLength - 0.12, 0.03)
    roof.translate(0, spec.roofY - 0.04, spec.cabinCenterZ)
    parts.push(roof)
    return tryMerge(parts) ?? parts[0]
  })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  body.receiveShadow = true
  body.userData.farVisible = true // keep visible in FAR/VERY FAR LOD mode
  group.add(body)

  /* --- greenhouse glass --- */
  const glassGeo = cached(variantGeoCache, `${opts.variant}:glass`, () => {
    const g = roundedBox(spec.cabinWidth, spec.roofY - spec.beltline - 0.05, spec.cabinLength, 0.12)
    g.translate(0, spec.beltline + (spec.roofY - spec.beltline - 0.05) / 2, spec.cabinCenterZ)
    return g
  })
  const glass = new THREE.Mesh(glassGeo, glassMat)
  group.add(glass)

  /* --- fenders (merged) --- */
  const fenderGeo = cached(variantGeoCache, `${opts.variant}:fender`, () => {
    const [fx, fy, fz] = spec.fenderSize
    const parts: THREE.BufferGeometry[] = []
    for (const sx of [-1, 1]) {
      for (const sz of [frontZ, rearZ]) {
        // Clone: roundedBox() hands out a shared cached geometry.
        const f = roundedBox(fx, fy, fz, 0.08).clone()
        f.translate(sx * (TR / 2 + 0.04), R - 0.02, sz)
        parts.push(f)
      }
    }
    return tryMerge(parts) ?? parts[0]
  })
  const fenders = new THREE.Mesh(fenderGeo, bodyMat)
  group.add(fenders)

  /* --- bumpers (merged) --- */
  const bumperGeo = cached(variantGeoCache, `${opts.variant}:bumper`, () => {
    const parts: THREE.BufferGeometry[] = []
    for (const sz of [L / 2 - 0.03, -L / 2 + 0.03]) {
      const b = roundedBox(W * 0.98, 0.3, 0.3, 0.09).clone()
      b.translate(0, 0.3, sz)
      parts.push(b)
    }
    return tryMerge(parts) ?? parts[0]
  })
  const bumpers = new THREE.Mesh(bumperGeo, trimMat)
  group.add(bumpers)

  /* --- mirrors (merged) --- */
  const mirrorGeo = cached(variantGeoCache, `${opts.variant}:mirror`, () => {
    const parts: THREE.BufferGeometry[] = []
    for (const sx of [-1, 1]) {
      const m = roundedBox(0.07, 0.12, 0.18, 0.03).clone()
      m.rotateY(-sx * 0.45)
      m.translate(sx * (W / 2 + 0.04), spec.beltline + 0.2, 0.48)
      parts.push(m)
    }
    return tryMerge(parts) ?? parts[0]
  })
  const mirrors = new THREE.Mesh(mirrorGeo, bodyMat)
  group.add(mirrors)

  /* --- wheels: steering pivot → rolling axle → tyre + rim --- */
  const tireGeo = tireGeometry(R)
  const rimGeo = rimGeometry(R)
  const wheels: CarWheel[] = []
  const corners: Array<[number, number, boolean]> = [
    [-1, frontZ, true], // front-left
    [1, frontZ, true], // front-right
    [-1, rearZ, false], // rear-left
    [1, rearZ, false], // rear-right
  ]
  for (const [sx, sz, isFront] of corners) {
    const steer = new THREE.Group()
    steer.position.set(sx * (TR / 2), R, sz)
    const roll = new THREE.Group()
    const tire = new THREE.Mesh(tireGeo, tireMat)
    tire.rotation.z = Math.PI / 2
    tire.castShadow = true
    const rim = new THREE.Mesh(rimGeo, rimMat)
    rim.rotation.z = Math.PI / 2
    roll.add(tire, rim)
    // Rear corners have no steering pivot: steer == roll (rotation.y ignored).
    if (isFront) {
      steer.add(roll)
      group.add(steer)
    } else {
      roll.position.copy(steer.position)
      group.add(roll)
    }
    wheels.push({ steer: isFront ? steer : roll, roll })
  }

  /* --- lights --- */
  const headGeo = smallBox(0.34, 0.12, 0.05)
  const headParts: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const h = headGeo.clone()
    h.translate(sx * 0.62, spec.beltline * 0.82, L / 2 - 0.04)
    headParts.push(h)
  }
  const headGeoMerged = tryMerge(headParts) ?? headParts[0]
  const headlights = new THREE.Mesh(headGeoMerged, headMat)
  group.add(headlights)

  const tailGeo = smallBox(0.42, 0.12, 0.05)
  const tailParts: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const t = tailGeo.clone()
    t.translate(sx * 0.62, spec.beltline * 0.82, -L / 2 + 0.05)
    tailParts.push(t)
  }
  const tailGeoMerged = tryMerge(tailParts) ?? tailParts[0]
  const taillights = new THREE.Mesh(tailGeoMerged, brakeMat)
  group.add(taillights)

  const turnGeo = smallBox(0.18, 0.12, 0.04)
  const turnL = new THREE.Mesh(turnGeo, turnMatL)
  turnL.position.set(-0.8, 0.44, L / 2 - 0.02)
  const turnR = new THREE.Mesh(turnGeo, turnMatR)
  turnR.position.set(0.8, 0.44, L / 2 - 0.02)
  group.add(turnL, turnR)

  /* --- headlight beams (fake, night only; no real lights = performance) --- */
  const beamGeo = cached(smallGeoCache, 'beam', () => {
    // Cone along +Z, flattened vertically so it reads as a pool of light on
    // the road rather than a tall cone standing on its side.
    const cone = new THREE.ConeGeometry(0.62, 6.4, 16, 1, true)
    cone.rotateX(Math.PI / 2) // apex → +Z (forward)
    cone.scale(1, 0.35, 1) // flatten the base ring vertically
    cone.translate(0, 0.28, 3.2)
    return cone
  })
  const beams: THREE.Object3D[] = []
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.set(sx * 0.55, 0, 0)
    beam.visible = false
    group.add(beam)
    beams.push(beam)
  }

  return {
    group,
    wheels,
    brakeMat,
    turnMatL,
    turnMatR,
    headMat,
    beams,
    variant: opts.variant,
    bodyColor: opts.color,
    scale,
    wheelRadius: R * scale,
    wheelbase: WB * scale,
    bodyLength: L * scale,
  }
}

/** Reset every per-instance animated value to its resting state. */
export function resetRig(rig: CarRig): void {
  rig.brakeMat.emissiveIntensity = RUNNING_LIGHT_DAY
  rig.turnMatL.emissiveIntensity = TURN_INDICATOR_OFF
  rig.turnMatR.emissiveIntensity = TURN_INDICATOR_OFF
  rig.headMat.emissiveIntensity = HEADLIGHT_DAY
  for (const beam of rig.beams) beam.visible = false
  for (const w of rig.wheels) {
    w.steer.rotation.y = 0
    w.roll.rotation.x = 0
  }
  setRigLod(rig, false)
}

/**
 * Distance LOD for a car rig. In far mode only the (merged) body stays
 * visible — wheels, glass, lights and mirrors are hidden, so a distant car
 * costs a single draw call instead of ~15.
 */
export function setRigLod(rig: CarRig, far: boolean): void {
  for (const child of rig.group.children) {
    child.visible = far ? !!child.userData.farVisible : true
  }
  for (const beam of rig.beams) if (far) beam.visible = false
}
