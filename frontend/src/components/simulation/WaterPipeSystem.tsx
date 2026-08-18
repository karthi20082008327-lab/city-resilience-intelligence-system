import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ROADS_X, ROADS_Z, CITY_HALF, ROAD_Y } from './constants'
import { useSimulationStore } from '../../stores/simulationStore'
import { ParticleSystem } from './ParticleSystem'

const PIPE_Y = -1.4
const PIPE_R = 0.4

/**
 * Underground potable water network. Pipes run beneath every road.
 * When the leak event is active, the affected pipe segment glows and water
 * gushes from the breach, spreading toward the surface and pooling on the road.
 */
export function WaterPipeSystem() {
  const leakPulse = useRef(0)
  const mode = useSimulationStore((s) => s.mode)

  const pipes = useMemo(() => {
    const items: THREE.Group[] = []
    for (const z of ROADS_Z) {
      const g = new THREE.Group()
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(PIPE_R, PIPE_R, CITY_HALF * 2, 12),
        new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.75, roughness: 0.35 }),
      )
      pipe.rotation.z = Math.PI / 2
      pipe.position.set(0, PIPE_Y, z)
      g.add(pipe)
      items.push(g)
    }
    for (const x of ROADS_X) {
      const g = new THREE.Group()
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(PIPE_R, PIPE_R, CITY_HALF * 2, 12),
        new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.75, roughness: 0.35 }),
      )
      pipe.rotation.x = Math.PI / 2
      pipe.position.set(x, PIPE_Y, 0)
      g.add(pipe)
      items.push(g)
    }
    return items
  }, [])

  const leakPoint = useMemo(() => new THREE.Vector3(-14, PIPE_Y, -30), [])
  const leakSegmentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#2563eb',
        emissive: '#1d4ed8',
        emissiveIntensity: 0.8,
        metalness: 0.6,
        roughness: 0.3,
        transparent: true,
        opacity: 0.95,
      }),
    [],
  )

  useFrame((_, delta) => {
    leakPulse.current += delta
    const active = mode === 'waterLeak'
    const pulse = 0.6 + Math.sin(leakPulse.current * 3) * 0.4
    leakSegmentMat.emissiveIntensity = active ? 0.8 + pulse : 0
  })

  return (
    <group>
      {pipes.map((p, i) => (
        <primitive key={i} object={p} />
      ))}
      {/* Leaking segment under the affected road (spans x=-20..0 on road z=-30) */}
      <mesh position={[-10, PIPE_Y, -30]} rotation={[0, 0, Math.PI / 2]} material={leakSegmentMat}>
        <cylinderGeometry args={[PIPE_R + 0.06, PIPE_R + 0.06, 20, 12]} />
      </mesh>
      <WaterLeakSimulation leakPoint={leakPoint} />
    </group>
  )
}

function WaterLeakSimulation({ leakPoint }: { leakPoint: THREE.Vector3 }) {
  const puddleRef = useRef<THREE.Mesh>(null)
  const fxGroup = useRef<THREE.Group>(null)
  const mode = useSimulationStore((s) => s.mode)
  const surface = new THREE.Vector3(leakPoint.x, ROAD_Y + 0.02, leakPoint.z)

  useFrame((_, delta) => {
    const active = mode === 'waterLeak'
    const dt = Math.min(delta, 0.05)
    if (fxGroup.current) {
      fxGroup.current.visible = active
      fxGroup.current.position.set(surface.x, 0, surface.z)
    }
    if (puddleRef.current) {
      const target = active ? 1 : 0
      puddleRef.current.scale.setScalar(
        THREE.MathUtils.damp(puddleRef.current.scale.x, target * 6.5, 2, dt),
      )
      const mat = puddleRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = THREE.MathUtils.damp(mat.opacity, active ? 0.85 : 0, 2, dt)
    }
  })

  return (
    <group ref={fxGroup} position={surface} visible={false}>
      {/* wet puddle on the road surface */}
      <mesh ref={puddleRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color="#0ea5e9" transparent opacity={0} roughness={0.05} metalness={0.2} />
      </mesh>
      {/* water column gushing upward */}
      <ParticleSystem
        config={{
          count: 60,
          color: '#38bdf8',
          size: 0.5,
          rise: 5.5,
          spread: 0.4,
          lifetime: 1.4,
          gravity: 9,
          radius: 0.25,
          yOffset: 0,
        }}
      />
      {/* mist spray */}
      <ParticleSystem
        config={{
          count: 30,
          color: '#bae6fd',
          size: 0.8,
          rise: 1.2,
          spread: 1.4,
          lifetime: 2.4,
          gravity: -0.4,
          radius: 0.5,
          opacity: 0.4,
          yOffset: 0.4,
        }}
      />
      {/* leak-point glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0.5, 0.75, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
