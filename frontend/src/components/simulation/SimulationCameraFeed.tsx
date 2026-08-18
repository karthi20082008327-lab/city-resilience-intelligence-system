import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { CityScene } from './CityScene'
import { CCTVCameras, CCTV_CAMERAS } from './CCTVCameras'
import { SimulationRuntime } from '../../simulation/runtime'
import { ROADS_X, ROADS_Z, LANE_OFFSET } from './constants'
import { VehicleSystem } from './VehicleSystem'

/**
 * Camera preset for a CCTV feed tile. Each defines a spherical pose
 * around a target: theta (azimuth), phi (polar from +Y), radius, and FOV.
 *
 * The five presets are tuned to the city layout so every tile shows a
 * distinct, close-up part of the main road grid (no shared drone view).
 */
export interface CameraPreset {
  theta: number
  phi: number
  radius: number
  target: [number, number, number]
  fov: number
}

/** Map each CCTV camera to a close-up angle at its own intersection. */
export const CCTV_PRESETS: Record<string, CameraPreset> = {
  // CAM-01 · Main Junction (roads x=0 & z=0) — looks from the NE corner down the crossroads
  traffic: {
    theta: 0.8,
    phi: 1.15,
    radius: 18,
    target: [0, 0.4, 0],
    fov: 58,
  },
  // CAM-02 · Tower B2 fire zone — looks straight at the tall building
  road: {
    theta: 2.75,
    phi: 1.25,
    radius: 15,
    target: [-12, 0.4, -13],
    fov: 60,
  },
  // CAM-03 · SE Crossroads (roads x=20 & z=20) — looks from the SW corner
  grid: {
    theta: 3.9,
    phi: 1.15,
    radius: 18,
    target: [20, 0.4, 20],
    fov: 56,
  },
  // CAM-04 · NW Water Main (roads x=-20 & z=-40) — looks up the long road
  water: {
    theta: 5.2,
    phi: 1.2,
    radius: 16,
    target: [-20, 0.4, -40],
    fov: 58,
  },
  // CAM-05 · East Expressway (road x=40) — looks down the eastern corridor
  emergency: {
    theta: 1.6,
    phi: 1.15,
    radius: 18,
    target: [40, 0.4, 0],
    fov: 56,
  },
}

function FeedLighting() {
  return (
    <>
      <ambientLight intensity={0.5} color="#b8c4d6" />
      <hemisphereLight intensity={0.9} color="#cfe2ff" groundColor="#3a4148" />
      <directionalLight
        position={[30, 60, 25]}
        intensity={1.7}
        color="#fff6e0"
        castShadow
        shadow-mapSize={[512, 512]}
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

function FeedAtmosphere() {
  return (
    <>
      <Sky
        distance={450}
        sunPosition={[60, 80, 40]}
        turbidity={4}
        rayleigh={1.6}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <fog attach="fog" args={['#bcd0e8', 90, 260]} />
    </>
  )
}

/**
 * A single CCTV feed tile. Renders a small 3D Canvas with the city scene
 * from a fixed camera angle matching the real CCTV camera placed in the
 * simulation. Uses a shared simplified runtime for vehicle animation without
 * the overhead of the full simulation page.
 */
export default function SimulationCameraFeed({
  preset,
  cameraId,
}: {
  preset: CameraPreset
  cameraId: number
}) {
  // Lightweight runtime with a handful of vehicles per feed tile
  const runtime = useMemo(
    () =>
      new SimulationRuntime({
        xs: ROADS_X,
        zs: ROADS_Z,
        laneOffset: LANE_OFFSET,
        vehicleSeed: 5000 + cameraId * 137,
        speedRange: [5, 9],
        pedestrianCount: 0,
      }),
    [cameraId]
  )

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[0.5, 1]}
        camera={{
          fov: preset.fov,
          near: 0.1,
          far: 400,
          // Position the camera at the exact 3D coordinates of the CCTV pole
          // (matching CCTV_CAMERAS), looking at the road below.
          position: [
            preset.target[0] + preset.radius * Math.sin(preset.phi) * Math.sin(preset.theta),
            preset.target[1] + preset.radius * Math.cos(preset.phi),
            preset.target[2] + preset.radius * Math.sin(preset.phi) * Math.cos(preset.theta),
          ],
        }}
        gl={{ antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: true }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <FeedLighting />
          <FeedAtmosphere />
          <CityScene />
          <CCTVCameras />
          <VehicleSystem runtime={runtime} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export { CCTV_CAMERAS }
