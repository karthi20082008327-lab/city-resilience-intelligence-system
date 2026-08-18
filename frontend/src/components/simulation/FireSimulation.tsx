import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '../../stores/simulationStore'
import { ParticleSystem } from './ParticleSystem'

/**
 * Building fire event — highly visible.
 * Sets a tall landmark building ablaze with large animated flames, heavy smoke,
 * a bright pulsing fire light, ground glow, and an emergency beacon.
 */
export function FireSimulation() {
  const fireGroup = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const beaconRef = useRef<THREE.PointLight>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  const fireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ff6600',
        transparent: true,
        opacity: 0.7,
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

    // bright flickering fire light
    if (lightRef.current) {
      lightRef.current.intensity = 8 + Math.sin(t * 11) * 3 + Math.sin(t * 23) * 1.5
    }

    // emergency beacon (alternating red/orange)
    if (beaconRef.current) {
      beaconRef.current.intensity = 4 + Math.sin(t * 8) * 3
      beaconRef.current.color.set(Math.sin(t * 4) > 0 ? '#ff3300' : '#ff9900')
    }

    // ground glow pulse
    if (glowRef.current) {
      const s = 1 + Math.sin(t * 5) * 0.15
      glowRef.current.scale.set(s, 1, s)
      const mat = glowRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.35 + Math.sin(t * 7) * 0.15
    }

    // animate flame planes rotating and pulsing
    if (fireGroup.current) {
      fireGroup.current.rotation.y += 0.004
      const s = 1 + Math.sin(t * 6) * 0.1
      fireGroup.current.scale.set(s, s, s)
    }
  })

  return (
    <group>
      {/* bright fire light above the building */}
      <group position={[BUILD.x, BUILD.h + 4, BUILD.z]} name="fire-marker">
        <pointLight ref={lightRef} color="#ff6600" intensity={0} distance={60} decay={2} />
      </group>

      {/* emergency beacon on rooftop */}
      <group position={[BUILD.x, BUILD.h + 1, BUILD.z]}>
        <pointLight ref={beaconRef} color="#ff3300" intensity={0} distance={30} decay={2} />
      </group>

      <group ref={fireGroup} position={[BUILD.x, 0, BUILD.z]} visible={false}>
        {/* large flame sheets — brighter and bigger */}
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            position={[0, BUILD.h * 0.6, 0]}
            rotation={[0, (i * Math.PI) / 4, 0]}
            material={fireMat}
          >
            <planeGeometry args={[5.5, BUILD.h * 0.7]} />
          </mesh>
        ))}

        {/* core fire particles — more particles, larger */}
        <group position={[0, BUILD.h * 0.5, 0]}>
          <ParticleSystem
            config={{
              count: 140,
              color: '#ff5500',
              size: 1.4,
              rise: 4,
              spread: 0.8,
              lifetime: 1.4,
              radius: 2,
              yOffset: -3,
            }}
          />
        </group>

        {/* bright yellow core */}
        <group position={[0, BUILD.h * 0.5, 0]}>
          <ParticleSystem
            config={{
              count: 70,
              color: '#ffcc00',
              size: 1.0,
              rise: 5,
              spread: 0.5,
              lifetime: 1.0,
              radius: 1.5,
              yOffset: -3,
            }}
          />
        </group>

        {/* white-hot center */}
        <group position={[0, BUILD.h * 0.45, 0]}>
          <ParticleSystem
            config={{
              count: 30,
              color: '#ffffff',
              size: 0.7,
              rise: 6,
              spread: 0.3,
              lifetime: 0.8,
              radius: 1,
              yOffset: -2,
            }}
          />
        </group>

        {/* heavy smoke rising above */}
        <group position={[0, BUILD.h + 2, 0]}>
          <ParticleSystem
            config={{
              count: 80,
              color: '#1f2937',
              size: 3.5,
              rise: 2.5,
              spread: 2.5,
              lifetime: 5,
              radius: 2,
              opacity: 0.6,
              blending: THREE.NormalBlending,
              grow: 1,
              yOffset: 0,
            }}
          />
        </group>

        {/* embers / sparks flying up */}
        <group position={[0, BUILD.h * 0.7, 0]}>
          <ParticleSystem
            config={{
              count: 50,
              color: '#ff9900',
              size: 0.3,
              rise: 7,
              spread: 2,
              lifetime: 2,
              radius: 2.5,
              gravity: -2,
            }}
          />
        </group>

        {/* ground glow — orange circle on the road */}
        <mesh
          ref={glowRef}
          position={[0, 0.05, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[8, 32]} />
          <meshBasicMaterial
            color="#ff4400"
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  )
}
