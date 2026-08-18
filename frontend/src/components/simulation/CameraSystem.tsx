import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '../../stores/simulationStore'

/**
 * Camera presets. Each defines a spherical pose around a target:
 * theta (azimuth), phi (polar from +Y), radius.
 */
const PRESETS = {
  street: {
    theta: 0.75,
    phi: 1.45,
    radius: 36,
    target: [0, 0.6, 0] as [number, number, number],
    fov: 58,
  },
  drone: {
    theta: 0.7,
    phi: 0.85,
    radius: 82,
    target: [0, 0, 0] as [number, number, number],
    fov: 46,
  },
}

const clampPhi = (p: number) => THREE.MathUtils.clamp(p, 0.12, Math.PI / 2 - 0.06)

/**
 * Custom camera rig: two named views (Street / Drone), smooth damped
 * transitions, pointer orbit, scroll zoom and event focusing.
 */
export function CameraSystem() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const cameraMode = useSimulationStore((s) => s.cameraMode)

  const cur = useRef({
    theta: PRESETS.drone.theta,
    phi: PRESETS.drone.phi,
    radius: PRESETS.drone.radius,
    target: new THREE.Vector3(...PRESETS.drone.target),
    fov: PRESETS.drone.fov,
  })
  const des = useRef({
    theta: PRESETS.drone.theta,
    phi: PRESETS.drone.phi,
    radius: PRESETS.drone.radius,
    target: new THREE.Vector3(...PRESETS.drone.target),
    fov: PRESETS.drone.fov,
  })
  const lastFocusToken = useRef(0)

  // pointer orbit state
  const dragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = gl.domElement
    const onDown = (e: PointerEvent) => {
      dragging.current = true
      lastPointer.current = { x: e.clientX, y: e.clientY }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastPointer.current.x
      const dy = e.clientY - lastPointer.current.y
      lastPointer.current = { x: e.clientX, y: e.clientY }
      des.current.theta -= dx * 0.005
      des.current.phi = clampPhi(des.current.phi - dy * 0.005)
    }
    const onUp = (e: PointerEvent) => {
      dragging.current = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      des.current.radius = THREE.MathUtils.clamp(des.current.radius + e.deltaY * 0.05, 8, 150)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  // Apply camera mode changes
  useEffect(() => {
    const p = PRESETS[cameraMode]
    des.current.theta = p.theta
    des.current.phi = p.phi
    des.current.radius = p.radius
    des.current.target.set(...p.target)
    des.current.fov = p.fov
  }, [cameraMode])

  useFrame((_, delta) => {
    const sim = useSimulationStore.getState()
    const dt = Math.min(delta, 0.05)

    // focus event requests
    if (sim.focusToken !== lastFocusToken.current) {
      lastFocusToken.current = sim.focusToken
      if (sim.mode !== 'normal') {
        const loc = sim.event.location
        des.current.target.set(loc.x, 0.6, loc.z)
        if (sim.cameraMode === 'street') {
          des.current.radius = 16
          des.current.phi = 0.85
        } else {
          des.current.radius = 48
        }
      }
    }

    const k = 1 - Math.exp(-dt * 2.2)
    cur.current.theta += (des.current.theta - cur.current.theta) * k
    cur.current.phi = clampPhi(cur.current.phi + (des.current.phi - cur.current.phi) * k)
    cur.current.radius += (des.current.radius - cur.current.radius) * k
    cur.current.target.lerp(des.current.target, k)
    cur.current.fov += (des.current.fov - cur.current.fov) * k

    // compute camera position from spherical coords around target
    const { theta, phi, radius } = cur.current
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)
    camera.position.set(
      cur.current.target.x + radius * sinPhi * Math.sin(theta),
      cur.current.target.y + radius * cosPhi,
      cur.current.target.z + radius * sinPhi * Math.cos(theta),
    )
    camera.lookAt(cur.current.target)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = cur.current.fov
      camera.updateProjectionMatrix()
    }
  })

  return null
}
