import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '../../stores/simulationStore'
import { getCars, resetAllCars } from './carRegistry'
import { ParticleSystem } from './ParticleSystem'

/**
 * Road accident event.
 * When triggered it picks cars near the event location, steers two of them
 * into a collision, stops nearby traffic and visualizes a non-graphic crash:
 * debris burst, smoke, flashing warning lights and a marker cone.
 */
export function AccidentSimulation() {
  const crashPoint = useRef(new THREE.Vector3(0, 0, 0))
  const crashed = useRef(false)
  const burstKey = useRef(0)
  const prevMode = useRef('normal')
  const fxGroup = useRef<THREE.Group>(null)
  const mode = useSimulationStore((s) => s.mode)

  const flashGroupObj = useMemo(() => {
    const g = new THREE.Group()
    const m1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.95 }),
    )
    m1.position.x = -0.4
    const m2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.95 }),
    )
    m2.position.x = 0.4
    g.add(m1, m2)
    g.position.y = 3
    g.visible = false
    return g
  }, [])

  // On mode change: arm / disarm the accident.
  useEffect(() => {
    if (mode === 'accident' && prevMode.current !== 'accident') {
      crashed.current = false
      const loc = useSimulationStore.getState().event.location
      crashPoint.current.set(loc.x, 0, loc.z)

      const cars = getCars()
      const scored = cars
        .map((c) => ({ c, d: c.group.position.distanceTo(crashPoint.current) }))
        .sort((a, b) => a.d - b.d)
      const primary = scored[0]?.c
      // Secondary car: the next-nearest vehicle that isn't the primary.
      const secondary = scored.slice(1).find((s) => s.c !== primary)?.c
      if (primary) {
        primary.override = crashPoint.current.clone()
        primary.targetSpeed = 12
      }
      if (secondary) {
        const off = secondary.group.position.clone().sub(crashPoint.current).normalize().multiplyScalar(1.2)
        secondary.override = crashPoint.current.clone().add(off)
        secondary.targetSpeed = 12
      }
    }
    if (mode !== 'accident' && prevMode.current === 'accident') {
      resetAllCars()
      crashed.current = false
      flashGroupObj.visible = false
    }
    prevMode.current = mode
  }, [mode, flashGroupObj])

  useFrame((_, delta) => {
    const sim = useSimulationStore.getState()
    const active = sim.mode === 'accident'
    const dt = Math.min(delta, 0.05)

    if (fxGroup.current) {
      fxGroup.current.visible = active
      if (!active) {
        flashGroupObj.visible = false
        return
      }
      const target = crashPoint.current.clone().setY(0)
      fxGroup.current.position.lerp(target, 1 - Math.exp(-dt * 4))
    }

    // detect impact: a car with override reached stop
    if (!crashed.current) {
      const stoppedCar = getCars().find((c) => c.override && c.stopped)
      if (stoppedCar) {
        crashed.current = true
        burstKey.current += 1
        flashGroupObj.visible = true
      }
    }

    // flashing emergency lights
    if (flashGroupObj.visible) {
      const t = performance.now() / 1000
      const m1 = flashGroupObj.children[0] as THREE.Mesh
      const m2 = flashGroupObj.children[1] as THREE.Mesh
      m1.visible = Math.sin(t * 6) > 0
      m2.visible = Math.sin(t * 6 + Math.PI) > 0
    }
  })

  return (
    <group ref={fxGroup}>
      {/* impact burst (keyed re-mount per crash) */}
      {burstKey.current > 0 && (
        <group key={burstKey.current}>
          <ParticleSystem
            config={{
              count: 70,
              color: '#fbbf24',
              size: 0.35,
              rise: 3,
              spread: 3,
              lifetime: 1.2,
              radius: 0.8,
              gravity: 8,
            }}
          />
          <ParticleSystem
            config={{
              count: 40,
              color: '#94a3b8',
              size: 0.3,
              rise: 2,
              spread: 2.5,
              lifetime: 1.4,
              radius: 0.6,
              gravity: 10,
            }}
          />
        </group>
      )}
      {/* persistent smoke while accident active */}
      <ParticleSystem
        config={{
          count: 36,
          color: '#475569',
          size: 1.4,
          rise: 1.6,
          spread: 1.2,
          lifetime: 3,
          radius: 1,
          opacity: 0.45,
          blending: THREE.NormalBlending,
          grow: 1,
        }}
      />
      {/* warning cone */}
      <mesh position={[0.6, 0, 0.8]} rotation={[0, -0.4, 0]}>
        <coneGeometry args={[0.45, 0.9, 12]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.6, 0, 0.9]} rotation={[0, 0.6, 0]}>
        <coneGeometry args={[0.4, 0.8, 12]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.6} />
      </mesh>
      <primitive object={flashGroupObj} />
    </group>
  )
}
