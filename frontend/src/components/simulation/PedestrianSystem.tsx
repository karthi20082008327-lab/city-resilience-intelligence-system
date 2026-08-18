import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildHumanoidRig, applyPose, type HumanoidRig } from './humanoidRig'
import { DETAIL_LEVELS } from '../../simulation/types'
import type { PedRenderState, SimulationRuntime } from '../../simulation/runtime'

/**
 * Pedestrian visual layer.
 *
 * NPCs are driven by the pure `PedestrianEngine` state machine inside the
 * shared {@link SimulationRuntime}. The runtime steps the engine at a fixed
 * tick rate and produces interpolated snapshots (`runtime.getPedestrians()`);
 * this component mirrors those snapshots onto reusable humanoid rigs. The
 * runtime feeds the engine a traffic sensor that reads the vehicle engine's
 * actual state, so pedestrians wait at crosswalks and step aside based on the
 * simulation's real vehicle positions — not on rendered/interpolated ones.
 *
 * Distance LOD: only the pedestrians closest to the view focus get full
 * humanoid rigs (a bounded pool). Everyone further out is rendered by a single
 * instanced low-poly silhouette, so scenes with many pedestrians stay cheap.
 */

/** Maximum number of full humanoid rigs (draw-call budget for the crowd). */
const MAX_FULL_RIGS = 24
/** Reassign full rigs to the nearest pedestrians every N frames. */
const RIG_REFRESH_FRAMES = 30

/** Muted top-colour palette for the distant instanced pedestrians. */
const DISTANT_SHIRT_COLORS = ['#e4572e', '#3a86ff', '#4a9d5b', '#e9c46a', '#9d4edd', '#f4a261', '#2a9d8f', '#e63946']

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/** Low-poly human silhouette (single geometry) for distant pedestrians. */
function buildDistantPedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const torso = new THREE.BoxGeometry(0.36, 0.6, 0.2)
  torso.translate(0, 0.7, 0)
  parts.push(torso)
  const head = new THREE.SphereGeometry(0.1, 8, 6)
  head.translate(0, 1.2, 0)
  parts.push(head)
  for (const s of [-1, 1]) {
    const leg = new THREE.BoxGeometry(0.1, 0.55, 0.12)
    leg.translate(s * 0.09, 0.27, 0)
    parts.push(leg)
    const arm = new THREE.BoxGeometry(0.07, 0.48, 0.1)
    arm.translate(s * 0.25, 0.74, 0)
    parts.push(arm)
  }
  const merged = mergeGeometries(parts)
  for (const g of parts) g.dispose()
  return merged
}

export function PedestrianSystem({ runtime }: { runtime: SimulationRuntime }) {
  const rootRef = useRef<THREE.Group>(null)
  const distantRef = useRef<THREE.InstancedMesh>(null)
  const camera = useThree((s) => s.camera)

  const pedCount = runtime.pedestrians.pedestrianCount
  const rigCount = Math.min(pedCount, MAX_FULL_RIGS)

  const rigs = useMemo<HumanoidRig[]>(
    () => Array.from({ length: rigCount }, (_, i) => buildHumanoidRig(i)),
    [rigCount]
  )
  const distantGeo = useMemo(() => buildDistantPedGeometry(), [])

  // pedIndex -> rigIndex (stable when the crowd fits in the rig pool).
  const assignRef = useRef<Map<number, number>>(new Map())
  const rigInUseRef = useRef<boolean[]>(new Array(rigCount).fill(false))
  const frameRef = useRef(0)
  const prevYawRef = useRef<number[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const shirtColors = useMemo(() => DISTANT_SHIRT_COLORS.map((c) => new THREE.Color(c)), [])

  const reassign = useMemo(() => {
    return (peds: PedRenderState[]) => {
      const newAssign = new Map<number, number>()
      const inUse = new Array(rigCount).fill(false)
      if (peds.length <= rigCount) {
        // Every pedestrian gets a rig (ped i keeps rig i → stable appearance).
        for (let i = 0; i < peds.length; i++) {
          newAssign.set(peds[i].index, i)
          inUse[i] = true
        }
      } else {
        // Too many pedestrians for the rig pool: give rigs to the nearest ones.
        const sorted = [...peds].sort((a, b) => {
          const ax = a.x - camera.position.x
          const az = a.z - camera.position.z
          const bx = b.x - camera.position.x
          const bz = b.z - camera.position.z
          return ax * ax + az * az - (bx * bx + bz * bz)
        })
        for (let i = 0; i < rigCount; i++) {
          newAssign.set(sorted[i].index, i)
          inUse[i] = true
        }
      }
      assignRef.current = newAssign
      rigInUseRef.current = inUse
    }
  }, [rigCount, camera])

  useFrame((_, delta) => {
    const dt = Math.max(delta, 1e-4)
    const peds = runtime.getPedestrians()
    const distant = distantRef.current
    if (!distant) return

    frameRef.current++
    if (frameRef.current % RIG_REFRESH_FRAMES === 0 || assignRef.current.size === 0) {
      reassign(peds)
    }

    const prevYaw = prevYawRef.current
    let n = 0
    for (const v of peds) {
      const rigIdx = assignRef.current.get(v.index)
      const rig = rigIdx !== undefined ? rigs[rigIdx] : undefined
      // With count <= rigCount, far pedestrians still hide their rig and fall
      // back to the instanced representation (distance LOD).
      const useRig = rig !== undefined && v.detail >= DETAIL_LEVELS.MEDIUM
      if (useRig && rig) {
        rig.group.visible = true
        rig.group.position.set(v.x, 0.02, v.z)
        rig.group.rotation.y = v.yaw
        const yawRate = wrapAngle(v.yaw - (prevYaw[v.index] ?? v.yaw)) / dt
        prevYaw[v.index] = v.yaw
        applyPose(rig, {
          state: v.state,
          phase: v.phase,
          speed: v.speed,
          time: runtime.simTime,
          yawRate,
          intensity: v.baseSpeed > 0 ? Math.min(1, v.speed / v.baseSpeed) : 0,
        })
      } else {
        if (rig) rig.group.visible = false
        dummy.position.set(v.x, 0.02, v.z)
        dummy.rotation.set(0, v.yaw, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        distant.setMatrixAt(n, dummy.matrix)
        distant.setColorAt(n, shirtColors[v.index % shirtColors.length])
        n++
      }
    }

    distant.count = n
    distant.instanceMatrix.needsUpdate = true
    if (distant.instanceColor) distant.instanceColor.needsUpdate = true
  })

  return (
    <group ref={rootRef}>
      {rigs.map((rig, i) => (
        <primitive key={i} object={rig.group} />
      ))}
      <instancedMesh
        ref={distantRef}
        args={[distantGeo, undefined, pedCount]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
    </group>
  )
}
