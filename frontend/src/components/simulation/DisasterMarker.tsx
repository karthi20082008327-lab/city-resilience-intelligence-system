import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore, type SimulationMode } from '../../stores/simulationStore'

const MARKER_INFO: Record<
  SimulationMode,
  { color: string; icon: string; label: string; height: number }
> = {
  normal: { color: '#10b981', icon: '✓', label: 'NORMAL', height: 6 },
  accident: { color: '#ef4444', icon: '🚨', label: 'ACCIDENT', height: 8 },
  waterLeak: { color: '#38bdf8', icon: '💧', label: 'WATER LEAK', height: 8 },
  fire: { color: '#f97316', icon: '🔥', label: 'FIRE', height: 12 },
}

/**
 * Pulsing 3D marker that hovers over the active event location.
 * Visible from the drone camera and points down toward the affected area.
 */
export function DisasterMarker() {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const beaconRef = useRef<THREE.Mesh>(null)
  const lastKey = useRef('')

  const { texture, canvas } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 96
    const tex = new THREE.CanvasTexture(c)
    tex.anisotropy = 4
    return { texture: tex, canvas: c }
  }, [])

  function redrawLabel(icon: string, label: string, color: string) {
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(15,23,42,0.92)'
    const r = 18
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.arcTo(256, 0, 256, 96, r)
    ctx.arcTo(256, 96, 0, 96, r)
    ctx.arcTo(0, 96, 0, 0, r)
    ctx.arcTo(0, 0, 256, 0, r)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${icon}  ${label}`, 128, 50)
    texture.needsUpdate = true
  }

  useFrame((state) => {
    const sim = useSimulationStore.getState()
    const mode = sim.mode
    const t = state.clock.elapsedTime
    const info = MARKER_INFO[mode]
    const group = groupRef.current

    if (!group) return

    if (mode === 'normal') {
      group.visible = false
      return
    }
    group.visible = true

    // move marker to event location
    const loc = sim.event.location
    const targetY = info.height
    group.position.x = loc.x
    group.position.z = loc.z
    group.position.y = THREE.MathUtils.damp(group.position.y, targetY, 3, state.clock.getDelta())

    // pulsing ring
    if (ringRef.current) {
      const s = 1 + Math.sin(t * 3) * 0.3
      ringRef.current.scale.setScalar(s)
      const mat = ringRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.5 + Math.sin(t * 3) * 0.3
    }
    // beacon bob
    if (beaconRef.current) {
      beaconRef.current.position.y = Math.sin(t * 2.5) * 0.25
    }

    // update texture per mode change
    if (lastKey.current !== mode) {
      lastKey.current = mode
      redrawLabel(info.icon, info.label, info.color)
    }
    const mat = beaconRef.current?.material as THREE.SpriteMaterial | undefined
    if (mat) mat.color.set(info.color)
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* vertical beam pointing down */}
      <mesh position={[0, -3, 0]}>
        <cylinderGeometry args={[0.15, 0.4, 6, 8, 1, true]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* pulsing ring on ground */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[1.1, 1.7, 32]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* beacon sphere */}
      <mesh ref={beaconRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* billboard label */}
      <sprite position={[0, 1.6, 0]} scale={[2.2, 0.85, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} />
      </sprite>
      {/* marker pole */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.8, 6]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
    </group>
  )
}
