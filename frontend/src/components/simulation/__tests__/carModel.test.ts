import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildCarRig,
  CAR_VARIANTS,
  CAR_BODY_COLORS,
  BRAKE_LIGHT_ON,
  HEADLIGHT_DAY,
  HEADLIGHT_NIGHT,
  RUNNING_LIGHT_DAY,
  RUNNING_LIGHT_NIGHT,
  TURN_INDICATOR_OFF,
  TURN_INDICATOR_ON,
  type CarRig,
  type CarVariantKind,
} from '../carModel'
import { updateCarVisuals, steerAngleFor, indicatorSides, wrapAngle, type CarVisualInputs } from '../carAnimator'

const BASE_INPUT: CarVisualInputs = {
  dt: 1 / 30,
  night: false,
  blinkOn: true,
  speed: 6,
  acceleration: 0,
  braking: 0,
  heading: 0,
  totalDistance: 0,
  turnType: null,
  laneChange: null,
  manual: false,
}

function inputs(partial: Partial<CarVisualInputs> & { heading?: number }): CarVisualInputs {
  return { ...BASE_INPUT, ...partial }
}

/** Bounding box of the car body (headlight beams excluded — they are a night effect). */
function carBox(rig: CarRig): THREE.Box3 {
  rig.group.updateWorldMatrix(true, true)
  const box = new THREE.Box3()
  rig.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !rig.beams.includes(obj)) box.expandByObject(obj)
  })
  return box
}

describe('carModel', () => {
  it('builds a rig with the full wheel / light hierarchy', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#c0182b' })
    expect(rig.group).toBeInstanceOf(THREE.Group)
    expect(rig.wheels).toHaveLength(4)
    // Front wheels have a dedicated steering pivot; rear wheels do not.
    expect(rig.wheels[0].steer).not.toBe(rig.wheels[0].roll)
    expect(rig.wheels[1].steer).not.toBe(rig.wheels[1].roll)
    expect(rig.wheels[2].steer).toBe(rig.wheels[2].roll)
    expect(rig.wheels[3].steer).toBe(rig.wheels[3].roll)
    // Every wheel exposes a rollable axle group that sits at the wheel centre.
    for (const w of rig.wheels) {
      expect(w.roll).toBeInstanceOf(THREE.Group)
    }
    expect(rig.brakeMat).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(rig.turnMatL).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(rig.turnMatR).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(rig.beams).toHaveLength(2)
    // Front wheels at +Z, rear wheels at −Z (front = +Z convention).
    const zs = rig.wheels.map((w) => w.steer.position.z)
    expect(zs[0]).toBeGreaterThan(0)
    expect(zs[1]).toBeGreaterThan(0)
    expect(zs[2]).toBeLessThan(0)
    expect(zs[3]).toBeLessThan(0)
  })

  it('produces realistic car proportions for every variant', () => {
    const variants: CarVariantKind[] = ['sedan', 'hatchback', 'suv']
    for (const variant of variants) {
      const rig = buildCarRig({ variant, color: '#1f4f9e' })
      const box = carBox(rig)
      const size = box.getSize(new THREE.Vector3())
      const spec = CAR_VARIANTS[variant]
      // Overall dimensions stay within sane city-car bands.
      expect(size.x).toBeGreaterThan(1.5)
      expect(size.x).toBeLessThan(2.3)
      expect(size.y).toBeGreaterThan(1.1)
      expect(size.y).toBeLessThan(CAR_VARIANTS.suv.height + 0.1)
      expect(size.z).toBeGreaterThan(spec.length - 0.4)
      expect(size.z).toBeLessThan(spec.length + 0.3)
      // Width must be narrower than the road lane.
      expect(size.x).toBeLessThan(2.2)
      // Height must stay under the street-light arm.
      expect(size.y).toBeLessThan(2)
    }
  })

  it('centres the rig on the ground with the roof above', () => {
    const rig = buildCarRig({ variant: 'hatchback', color: '#2e7d32' })
    const box = carBox(rig)
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05)
    expect(box.max.y).toBeLessThan(1.6)
  })

  it('front (headlight) lights point to +Z and brake lights to −Z', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#1c1c22' })
    rig.group.updateWorldMatrix(true, true)
    let headZMin = Infinity
    let tailZMax = -Infinity
    rig.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const bounds = new THREE.Box3().setFromObject(obj)
      if (obj.material === rig.headMat) headZMin = Math.min(headZMin, bounds.min.z)
      if (obj.material === rig.brakeMat) tailZMax = Math.max(tailZMax, bounds.max.z)
    })
    expect(headZMin).toBeGreaterThan(1.5) // headlights at the front
    expect(tailZMax).toBeLessThan(-1.5) // brake lights at the rear
  })

  it('shares geometry and paint materials across cars of the same kind', () => {
    const a = buildCarRig({ variant: 'sedan', color: '#c0182b' })
    const b = buildCarRig({ variant: 'sedan', color: '#c0182b' })
    const differentColor = buildCarRig({ variant: 'sedan', color: '#1f4f9e' })
    const suv = buildCarRig({ variant: 'suv', color: '#c0182b' })

    const bodyMeshes = (rig: CarRig) =>
      rig.group.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[]
    expect(bodyMeshes(a)[0].geometry).toBe(bodyMeshes(b)[0].geometry)
    expect(bodyMeshes(a)[0].material).toBe(bodyMeshes(b)[0].material)
    expect(bodyMeshes(a)[0].material).not.toBe(bodyMeshes(differentColor)[0].material)
    expect(bodyMeshes(a)[0].geometry).not.toBe(bodyMeshes(suv)[0].geometry)
    // Per-instance light materials are NOT shared between cars.
    expect(a.brakeMat).not.toBe(b.brakeMat)
  })

  it('covers every paint colour in the palette', () => {
    for (const color of CAR_BODY_COLORS) {
      const rig = buildCarRig({ variant: 'hatchback', color })
      const mat = rig.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh
      expect('#' + (mat.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(color)
    }
  })
})

describe('carAnimator: wheel rolling', () => {
  it('rotates wheels exactly by distance travelled / tyre radius', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#2e7d32' })
    const r = rig.wheelRadius
    const dist = 12.5
    let total = 0
    const steps = 50
    const per = dist / steps
    updateCarVisuals(rig, inputs({ totalDistance: 0 })) // initialise per-rig state
    for (let i = 0; i < steps; i++) {
      total += per
      updateCarVisuals(rig, inputs({ totalDistance: total, heading: 0.3, speed: 6 }))
    }
    for (const w of rig.wheels) {
      expect(w.roll.rotation.x).toBeCloseTo(dist / r, 5)
    }
  })

  it('one full tyre rotation equals one wheel circumference of travel', () => {
    const rig = buildCarRig({ variant: 'suv', color: '#5e6b7a' })
    const circumference = 2 * Math.PI * rig.wheelRadius
    updateCarVisuals(rig, inputs({ totalDistance: 0 })) // initialise per-rig state
    updateCarVisuals(rig, inputs({ totalDistance: circumference }))
    expect(rig.wheels[0].roll.rotation.x).toBeCloseTo(2 * Math.PI, 5)
  })

  it('stops rotating as soon as travel stops', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#0f766e' })
    updateCarVisuals(rig, inputs({ totalDistance: 3, speed: 6 }))
    const before = rig.wheels[0].roll.rotation.x
    for (let i = 0; i < 20; i++) {
      updateCarVisuals(rig, inputs({ totalDistance: 3, speed: 0 }))
    }
    expect(rig.wheels[0].roll.rotation.x).toBe(before)
  })

  it('ignores the totalDistance reset that happens on a reroute', () => {
    const rig = buildCarRig({ variant: 'hatchback', color: '#8a3ab6' })
    updateCarVisuals(rig, inputs({ totalDistance: 8, speed: 6 }))
    const before = rig.wheels[0].roll.rotation.x
    updateCarVisuals(rig, inputs({ totalDistance: 0, speed: 6 })) // reroute reset
    expect(rig.wheels[0].roll.rotation.x).toBe(before)
  })
})

describe('carAnimator: steering', () => {
  it('steerAngleFor maps curvature to the bicycle-model angle', () => {
    // 1 rad heading change over 10 m of travel, 2.7 m wheelbase.
    const steer = steerAngleFor(1, 10, 2.7)
    expect(steer).toBeCloseTo(Math.atan(0.27), 5)
    // No travel → straight wheels.
    expect(steerAngleFor(1, 0, 2.7)).toBe(0)
    // Opposite curvature → opposite sign.
    expect(steerAngleFor(-1, 10, 2.7)).toBeCloseTo(-steer, 5)
  })

  it('turns the front wheels into a right-hand turn (heading increasing)', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#c0182b' })
    // Drive a steady right turn: heading grows ~0.13 rad per metre.
    let total = 0
    let heading = 0
    for (let i = 0; i < 40; i++) {
      total += 0.2
      heading += 0.04
      updateCarVisuals(rig, inputs({ totalDistance: total, heading, speed: 6 }))
    }
    const steer = rig.wheels[0].steer.rotation.y
    expect(steer).toBeGreaterThan(0.1)
    expect(rig.wheels[1].steer.rotation.y).toBeCloseTo(steer, 5)
    // Rear wheels have no steering pivot.
    expect(rig.wheels[2].steer.rotation.y).toBe(0)
    expect(rig.wheels[3].steer.rotation.y).toBe(0)
  })

  it('turns the front wheels into a left-hand turn (heading decreasing)', () => {
    const rig = buildCarRig({ variant: 'suv', color: '#1f4f9e' })
    let total = 0
    let heading = 0.5
    for (let i = 0; i < 40; i++) {
      total += 0.2
      heading -= 0.04
      updateCarVisuals(rig, inputs({ totalDistance: total, heading, speed: 6 }))
    }
    expect(rig.wheels[0].steer.rotation.y).toBeLessThan(-0.1)
  })

  it('straightens the wheels on a straight road', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#c98a12' })
    let total = 0
    for (let i = 0; i < 12; i++) {
      total += 0.2
      updateCarVisuals(rig, inputs({ totalDistance: total, heading: 0, speed: 6 }))
    }
    expect(rig.wheels[0].steer.rotation.y).toBeCloseTo(0, 3)
  })

  it('keeps steering steady while stopped', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#b45309' })
    // Steer into a turn...
    let total = 0
    let heading = 0
    for (let i = 0; i < 40; i++) {
      total += 0.2
      heading += 0.04
      updateCarVisuals(rig, inputs({ totalDistance: total, heading, speed: 6 }))
    }
    const turned = rig.wheels[0].steer.rotation.y
    expect(turned).toBeGreaterThan(0.1)
    // ...then stop: the wheels hold their angle instead of snapping straight.
    for (let i = 0; i < 20; i++) {
      updateCarVisuals(rig, inputs({ totalDistance: total, heading, speed: 0 }))
    }
    expect(rig.wheels[0].steer.rotation.y).toBe(turned)
  })
})

describe('carAnimator: lights', () => {
  it('shows brake lights while decelerating, running lights otherwise', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#2e7d32' })
    updateCarVisuals(rig, inputs({ braking: 4, acceleration: -4 }))
    expect(rig.brakeMat.emissiveIntensity).toBe(BRAKE_LIGHT_ON)
    updateCarVisuals(rig, inputs({ braking: 0, acceleration: 0 }))
    expect(rig.brakeMat.emissiveIntensity).toBe(RUNNING_LIGHT_DAY)
  })

  it('raises running lights and turns on headlights + beams at night', () => {
    const rig = buildCarRig({ variant: 'hatchback', color: '#c0182b' })
    updateCarVisuals(rig, inputs({ night: true }))
    expect(rig.brakeMat.emissiveIntensity).toBe(RUNNING_LIGHT_NIGHT)
    expect(rig.headMat.emissiveIntensity).toBe(HEADLIGHT_NIGHT)
    expect(rig.beams.every((b) => b.visible)).toBe(true)
    updateCarVisuals(rig, inputs({ night: false }))
    expect(rig.headMat.emissiveIntensity).toBe(HEADLIGHT_DAY)
    expect(rig.beams.every((b) => !b.visible)).toBe(true)
  })

  it('forces brake lights on while a stopped crash car sits at the scene', () => {
    const rig = buildCarRig({ variant: 'suv', color: '#5e6b7a' })
    updateCarVisuals(rig, inputs({ manual: true, speed: 0, brakeForce: 'on' }))
    expect(rig.brakeMat.emissiveIntensity).toBe(BRAKE_LIGHT_ON)
  })

  it('blinks the left indicator during a left turn, right not lit', () => {
    const rig = buildCarRig({ variant: 'sedan', color: '#0f766e' })
    updateCarVisuals(rig, inputs({ turnType: 'left', blinkOn: true }))
    expect(rig.turnMatL.emissiveIntensity).toBe(TURN_INDICATOR_ON)
    expect(rig.turnMatR.emissiveIntensity).toBe(TURN_INDICATOR_OFF)
    updateCarVisuals(rig, inputs({ turnType: 'left', blinkOn: false }))
    expect(rig.turnMatL.emissiveIntensity).toBe(TURN_INDICATOR_OFF)
  })

  it('blinks the right indicator during a right turn and both for a u-turn', () => {
    const right = buildCarRig({ variant: 'sedan', color: '#0f766e' })
    updateCarVisuals(right, inputs({ turnType: 'right', blinkOn: true }))
    expect(right.turnMatR.emissiveIntensity).toBe(TURN_INDICATOR_ON)
    expect(right.turnMatL.emissiveIntensity).toBe(TURN_INDICATOR_OFF)

    const u = buildCarRig({ variant: 'sedan', color: '#0f766e' })
    updateCarVisuals(u, inputs({ turnType: 'uturn', blinkOn: true }))
    expect(u.turnMatL.emissiveIntensity).toBe(TURN_INDICATOR_ON)
    expect(u.turnMatR.emissiveIntensity).toBe(TURN_INDICATOR_ON)
  })

  it('signals a lane change toward the outer (right) lane in right-hand traffic', () => {
    expect(indicatorSides(null, { fromLaneIndex: 0, toLaneIndex: 1, startProgress: 0, length: 8 })).toEqual({
      left: false,
      right: true,
    })
    expect(indicatorSides(null, { fromLaneIndex: 1, toLaneIndex: 0, startProgress: 0, length: 8 })).toEqual({
      left: true,
      right: false,
    })
    expect(indicatorSides('straight', null)).toEqual({ left: false, right: false })
  })

  it('wrapAngle returns a difference in (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 5)
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 5)
    expect(wrapAngle(0.25)).toBeCloseTo(0.25, 5)
  })
})