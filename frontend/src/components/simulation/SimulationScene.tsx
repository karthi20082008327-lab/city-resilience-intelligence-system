import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Sky, Stars } from '@react-three/drei'
import { useSimulationStore } from '../../stores/simulationStore'
import { SimulationRuntime } from '../../simulation/runtime'
import { ROADS_X, ROADS_Z, LANE_OFFSET } from './constants'
import { CityScene } from './CityScene'
import { VehicleSystem } from './VehicleSystem'
import { PedestrianSystem } from './PedestrianSystem'
import { WaterPipeSystem } from './WaterPipeSystem'
import { AccidentSimulation } from './AccidentSimulation'
import { FireSimulation } from './FireSimulation'
import { DisasterMarker } from './DisasterMarker'
import { CameraSystem } from './CameraSystem'
import { CCTVCameras } from './CCTVCameras'

function Lighting() {
  const timeOfDay = useSimulationStore((s) => s.timeOfDay)

  const sunLight = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const night = timeOfDay === 'night'
    if (sunLight.current) {
      sunLight.current.intensity = THREE.MathUtils.damp(sunLight.current.intensity, night ? 0.25 : 1.7, 2, dt)
      sunLight.current.color.set(night ? '#9db4ff' : '#fff6e0')
    }
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.damp(ambient.current.intensity, night ? 0.5 : 0.45, 2, dt)
      ambient.current.color.set(night ? '#1e2a4a' : '#b8c4d6')
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, night ? 0.3 : 0.9, 2, dt)
      hemi.current.color.set(night ? '#223355' : '#cfe2ff')
    }
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0.45} color="#b8c4d6" />
      <hemisphereLight ref={hemi} intensity={0.9} color="#cfe2ff" groundColor="#3a4148" />
      <directionalLight
        ref={sunLight}
        position={[30, 60, 25]}
        intensity={1.7}
        color="#fff6e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
    </>
  )
}

/** Handles the underground cutaway: fades surface geometry out so pipes show. */
function UndergroundView() {
  const underground = useSimulationStore((s) => s.underground)
  const scene = useThree((s) => s.scene)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const target = underground ? 0.35 : 1
    // Fade every opaque surface material that sits above the pipes. When the
    // cutaway is off, fully restore opacity and drop transparency again so the
    // scene stays on the fast opaque rendering path.
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
        if (mat && 'transparent' in mat) {
          if (obj.position.y > -0.5 && !obj.userData.keepOpaque) {
            if (underground) {
              mat.transparent = true
              mat.opacity = THREE.MathUtils.damp(mat.opacity, target, 2.5, dt)
            } else {
              mat.opacity = THREE.MathUtils.damp(mat.opacity, 1, 4, dt)
              if (mat.opacity >= 0.999 && mat.transparent) {
                mat.transparent = false
                mat.opacity = 1
                mat.needsUpdate = true
              }
            }
          }
        }
      }
    })
  })

  return null
}

function Atmospheric() {
  const timeOfDay = useSimulationStore((s) => s.timeOfDay)
  return (
    <>
      <Sky
        distance={450}
        sunPosition={timeOfDay === 'day' ? [60, 80, 40] : [-80, 15, -20]}
        turbidity={timeOfDay === 'day' ? 4 : 12}
        rayleigh={timeOfDay === 'day' ? 1.6 : 3.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      {timeOfDay === 'night' && <Stars radius={300} depth={50} count={4000} factor={6} fade speed={1} />}
      <fog attach="fog" args={[timeOfDay === 'day' ? '#bcd0e8' : '#0a1226', 90, 260]} />
    </>
  )
}

function ViewFocus({ runtime }: { runtime: SimulationRuntime }) {
  // Feed the camera position into the runtime every frame: it drives the
  // per-entity simulation detail levels (NEAR/MEDIUM/FAR/VERY FAR).
  useFrame(({ camera }) => {
    runtime.setViewCenter(camera.position.x, camera.position.z)
  })
  return null
}

/** Non-negative integer query parameter (e.g. `?peds=150&cars=100`). */
function readIntParam(name: string, fallback: number): number {
  const v = new URLSearchParams(window.location.search).get(name)
  const n = v === null ? NaN : parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function SceneContent() {
  // One fixed-tick simulation runtime shared by every system: it steps both
  // the vehicle and pedestrian engines at a fixed rate and serves interpolated
  // snapshots to the visual layers (see src/simulation/runtime.ts).
  const runtime = useMemo(
    () =>
      new SimulationRuntime({
        xs: ROADS_X,
        zs: ROADS_Z,
        laneOffset: LANE_OFFSET,
        vehicleSeed: 20260813,
        speedRange: [5, 9],
        // `?peds=N` overrides the pedestrian count (LOD keeps it cheap).
        pedestrianCount: readIntParam('peds', 24),
      }),
    []
  )

  // Dev/verification hook: expose the runtime + store so tooling can inspect
  // detail levels, entity counts, and sim state from the browser console.
  useEffect(() => {
    const w = window as unknown as {
      __crisRuntime?: SimulationRuntime
      __crisStore?: typeof useSimulationStore
    }
    w.__crisRuntime = runtime
    w.__crisStore = useSimulationStore
    return () => {
      delete w.__crisRuntime
      delete w.__crisStore
    }
  }, [runtime])

  return (
    <>
      <Lighting />
      <Atmospheric />
      <UndergroundView />
      <ViewFocus runtime={runtime} />
      <CityScene />
      <WaterPipeSystem />
      <VehicleSystem runtime={runtime} />
      <PedestrianSystem runtime={runtime} />
      <AccidentSimulation />
      <FireSimulation />
      <DisasterMarker />
      <CCTVCameras />
      <CameraSystem />
    </>
  )
}

export { SceneContent }
