import { useMemo } from 'react'
import { useSimulationStore } from '../../stores/simulationStore'

/**
 * A visible CCTV camera placed in the 3D city. Each camera is a pole with a
 * small camera housing on top. The active/incident camera gets a red blink.
 *
 * Camera positions are at the city's key intersections / focus zones so each
 * of the five feeds shows a distinct, close-up part of the city.
 */
export const CCTV_CAMERAS = [
  { id: 1, name: 'CAM-01 · Main Junction', x: 0, z: 0, rotationY: -0.5 },
  { id: 2, name: 'CAM-02 · Tower B2 (Fire Zone)', x: -9, z: -17, rotationY: 0.4 },
  { id: 3, name: 'CAM-03 · SE Crossroads', x: 20, z: 20, rotationY: 2.1 },
  { id: 4, name: 'CAM-04 · NW Water Main', x: -20, z: -40, rotationY: 5.0 },
  { id: 5, name: 'CAM-05 · East Expressway', x: 40, z: 0, rotationY: 3.4 },
]

/** Simple cylinder + box CCTV camera on a pole. */
function CCTVModel({
  position,
  rotationY,
  active,
}: {
  position: [number, number, number]
  rotationY: number
  active: boolean
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} name="cctv-camera">
      {/* Pole */}
      <mesh position={[0, 4.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 9, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Camera head */}
      <mesh position={[0, 9.2, 0]}>
        <boxGeometry args={[0.55, 0.35, 0.45]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 9.05, -0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.12, 10]} />
        <meshStandardMaterial color="#0ea5e9" roughness={0.2} metalness={0.6} />
      </mesh>
      {/* Status light (red blink when incident is active on this camera) */}
      <mesh position={[0.28, 9.3, 0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color={active ? '#ef4444' : '#22c55e'}
          emissive={active ? '#ef4444' : '#22c55e'}
          emissiveIntensity={active ? 3 : 1.5}
        />
      </mesh>
    </group>
  )
}

/**
 * All five CCTV cameras as a group. The incident camera (if any) blinks red.
 */
export function CCTVCameras() {
  const mode = useSimulationStore((s) => s.mode)

  // Which camera is relevant to the current active event:
  //  - accident   -> CAM-01 (main junction)
  //  - fire       -> CAM-02 (tower block)
  //  - waterLeak  -> CAM-04 (water main)
  const activeCameraId = mode === 'accident' ? 1 : mode === 'fire' ? 2 : mode === 'waterLeak' ? 4 : null

  const models = useMemo(
    () =>
      CCTV_CAMERAS.map((cam) => (
        <CCTVModel
          key={cam.id}
          position={[cam.x, 0, cam.z]}
          rotationY={cam.rotationY}
          active={activeCameraId === cam.id}
        />
      )),
    [activeCameraId]
  )

  return <group name="cctv-cameras">{models}</group>
}
