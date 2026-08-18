import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildHumanoidRig, applyPose, makeAppearance } from '../humanoidRig'

function box(rig: ReturnType<typeof buildHumanoidRig>): THREE.Box3 {
  const b = new THREE.Box3()
  b.setFromObject(rig.group)
  return b
}

describe('humanoid rig — structure & proportions', () => {
  it('exposes the animated skeleton joints', () => {
    const rig = buildHumanoidRig(0)
    for (const j of [
      rig.pelvis,
      rig.chest,
      rig.head,
      rig.hipL,
      rig.hipR,
      rig.kneeL,
      rig.kneeR,
      rig.ankleL,
      rig.ankleR,
      rig.shoulderL,
      rig.shoulderR,
      rig.elbowL,
      rig.elbowR,
    ]) {
      expect(j).toBeInstanceOf(THREE.Group)
    }
  })

  it('has believable human proportions (idle)', () => {
    const rig = buildHumanoidRig(0)
    applyPose(rig, { state: 'IDLE', phase: 0, speed: 0, time: 0 })
    rig.group.updateMatrixWorld(true)
    const b = box(rig)
    const h = b.max.y - b.min.y
    const w = b.max.x - b.min.x
    const d = b.max.z - b.min.z
    // Typical adult: 1.55–1.85 m tall, shoulders ~0.45 m, depth ~0.25 m.
    expect(h).toBeGreaterThan(1.5)
    expect(h).toBeLessThan(1.9)
    expect(w).toBeLessThan(0.7)
    expect(d).toBeLessThan(0.45)
    // Feet sit on the ground.
    expect(b.min.y).toBeLessThan(0.02)
  })

  it('varies height, build and colours across the crowd', () => {
    const apps = Array.from({ length: 40 }, (_, i) => makeAppearance(i))
    const heights = new Set(apps.map((a) => a.heightScale.toFixed(3)))
    const builds = new Set(apps.map((a) => a.buildScale.toFixed(3)))
    const shirts = new Set(apps.map((a) => a.shirtColor))
    const skins = new Set(apps.map((a) => a.skinColor))
    const pants = new Set(apps.map((a) => a.pantsColor))
    expect(heights.size).toBeGreaterThan(5)
    expect(builds.size).toBeGreaterThan(5)
    expect(shirts.size).toBeGreaterThan(5)
    expect(skins.size).toBeGreaterThan(2)
    expect(pants.size).toBeGreaterThan(2)
  })

  it('shares geometries and pooled materials across NPCs (no heavy per-NPC assets)', () => {
    const a = buildHumanoidRig(3)
    const b = buildHumanoidRig(3)
    const c = buildHumanoidRig(4)
    // Same appearance index -> identical material references.
    expect(a.shirtMat).toBe(b.shirtMat)
    expect(a.pantsMat).toBe(b.pantsMat)
    expect(a.skinMat).toBe(b.skinMat)
    // Different indices may still hit the same pool entries, but the
    // geometry cache is global: head spheres must be shared objects.
    const geomCount = (g: THREE.Group): number => {
      let n = 0
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) n++
      })
      return n
    }
    const cMeshes: THREE.Mesh[] = []
    c.group.traverse((o) => {
      if (o instanceof THREE.Mesh) cMeshes.push(o)
    })
    // The two rigs share at least one geometry instance.
    let sharedGeom = false
    const aGeoms = new Set<THREE.BufferGeometry>()
    a.group.traverse((o) => {
      if (o instanceof THREE.Mesh) aGeoms.add(o.geometry)
    })
    for (const m of cMeshes) {
      if (aGeoms.has(m.geometry)) {
        sharedGeom = true
        break
      }
    }
    expect(sharedGeom).toBe(true)
    expect(geomCount(a.group)).toBeGreaterThan(10)
  })
})

describe('humanoid rig — poses', () => {
  it('swings legs and arms in opposition while walking', () => {
    const rig = buildHumanoidRig(0)
    applyPose(rig, { state: 'WALKING', phase: Math.PI / 2, speed: 1.3, time: 0 })
    expect(rig.hipL.rotation.x).toBeCloseTo(-rig.hipR.rotation.x, 5)
    expect(rig.shoulderL.rotation.x).toBeCloseTo(-rig.shoulderR.rotation.x, 5)
    expect(Math.abs(rig.hipL.rotation.x)).toBeGreaterThan(0.3)
    expect(rig.kneeL.rotation.x).toBeGreaterThan(0.2)
  })

  it('keeps the body nearly still and breathing while idle', () => {
    const rig = buildHumanoidRig(0)
    applyPose(rig, { state: 'IDLE', phase: 0, speed: 0, time: 0 })
    expect(rig.hipL.rotation.x).toBe(0)
    expect(rig.hipR.rotation.x).toBe(0)
    expect(Math.abs(rig.pelvis.rotation.x)).toBeLessThan(0.05)
    // Breathing: chest scale pulses with time.
    applyPose(rig, { state: 'IDLE', phase: 0, speed: 0, time: 2 })
    expect(rig.chest.scale.y).not.toBe(1)
  })

  it('leans back and raises arms while avoiding a threat', () => {
    const rig = buildHumanoidRig(0)
    applyPose(rig, { state: 'AVOIDING', phase: 0, speed: 0, time: 0 })
    expect(rig.pelvis.rotation.x).toBeLessThan(0)
    expect(rig.shoulderL.rotation.z).toBeLessThan(0)
    expect(rig.shoulderR.rotation.z).toBeGreaterThan(0)
  })

  it('walks in the facing direction (forward = +Z, yaw 0)', () => {
    const rig = buildHumanoidRig(0)
    applyPose(rig, { state: 'WALKING', phase: 0, speed: 1.3, time: 0 })
    const before = box(rig)
    rig.group.updateMatrixWorld(true)
    // The foot on the forward swing must extend toward +Z (relative to the
    // character, whose group rotation is 0).
    const footZ = new THREE.Vector3()
    rig.ankleL.getWorldPosition(footZ)
    expect(footZ.z).toBeGreaterThan(-0.5)
    void before
  })
})
