import type * as THREE from 'three'
import type { CarRig } from './carModel'

/**
 * Shared registry of all live car rigs so the accident system can pick a
 * target vehicle without prop-drilling through the R3F tree.
 *
 * Each handle is one pooled car rig tied to a simulation-engine vehicle via
 * `vehicleId`, plus the live fields the accident system and animator need.
 */
export interface CarHandle extends CarRig {
  vehicleId: string
  speed: number
  targetSpeed: number
  /** When set, the vehicle is driven toward this point instead of its route. */
  override: THREE.Vector3 | null
  stopped: boolean
  index: number
}

const registry: CarHandle[] = []

export function registerCar(car: CarHandle) {
  registry.push(car)
}

export function clearCarRegistry() {
  registry.length = 0
}

export function getCars(): CarHandle[] {
  return registry
}

export function resetAllCars() {
  for (const car of registry) {
    car.override = null
    car.stopped = false
    car.brakeMat.emissiveIntensity = 0.35
    car.turnMatL.emissiveIntensity = 0
    car.turnMatR.emissiveIntensity = 0
    car.headMat.emissiveIntensity = 0
    for (const beam of car.beams) beam.visible = false
  }
}
