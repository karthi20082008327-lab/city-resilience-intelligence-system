import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '../../stores/simulationStore'
import { ParticleSystem } from './ParticleSystem'

/**
 * Building fire event.
 * Sets a tall landmark building ablaze with animated flames, rising smoke,
 * a flickering fire light and an emergency glow.
 */
export function FireSimulation() {
  const fireGroup = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const fireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#f97316',
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )

  // building fire target
  const BUILD = { x: -12, z: -13, h: 16, w: 7, d: 7 }

  useFrame((state) => {
    const sim = useSimulationStore.getState()
    const active = sim.mode === 'fire'
    if (fireGroup.current) fireGroup.current.visible = active
    if (!active) return

    const t = state.clock.elapsedTime
    // flickering fire light
    if (lightRef.current) {
      lightRef.current.intensity = 3 + Math.sin(t * 11) * 1.2 + Math.sin(t * 23) * 0.6
    }
    // animate flame planes rotating
    if (fireGroup.current) {
      fireGroup.current.rotation.y += 0.003
      const s = 1 + Math.sin(t * 6) * 0.08
      fireGroup.current.scale.set(s, s, s)
    }
  })

  return (
    <group>
      {/* emergency light beam above the building */}
      <group position={[BUILD.x, BUILD.h + 6, BUILD.z]} name="fire-marker">
        <pointLight ref={lightRef} color="#f97316" intensity={0} distance={40} decay={2} />
      </group>

      <group ref={fireGroup} position={[BUILD.x, 0, BUILD.z]} visible={false}>
        {/* flame sheets */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, BUILD.h * 0.65, 0]} rotation={[0, (i * Math.PI) / 3, 0]} material={fireMat}>
            <planeGeometry args={[4.4, BUILD.h * 0.6]} />
          </mesh>
        ))}
        {/* core fire particles */}
        <group position={[0, BUILD.h * 0.55, 0]}>
          <ParticleSystem
            config={{
              count: 90,
              color: '#f97316',
              size: 0.9,
              rise: 3.5,
              spread: 0.6,
              lifetime: 1.6,
              radius: 1.6,
              yOffset: -2,
            }}
          />
        </group>
        {/* bright core */}
        <group position={[0, BUILD.h * 0.55, 0]}>
          <ParticleSystem
            config={{
              count: 40,
              color: '#fde047',
              size: 0.6,
              rise: 4.5,
              spread: 0.4,
              lifetime: 1.1,
              radius: 1.2,
              yOffset: -2,
            }}
          />
        </group>
        {/* smoke rising above */}
        <group position={[0, BUILD.h + 2, 0]}>
          <ParticleSystem
            config={{
              count: 50,
              color: '#374151',
              size: 2.2,
              rise: 2.2,
              spread: 1.8,
              lifetime: 4,
              radius: 1.4,
              opacity: 0.55,
              blending: THREE.NormalBlending,
              grow: 1,
              yOffset: 0,
            }}
          />
        </group>
      </group>
    </group>
  )
}
