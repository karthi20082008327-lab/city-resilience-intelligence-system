import * as THREE from 'three'
import type { LaneChange, TurnType } from '../../simulation/types'
import {
  BRAKE_LIGHT_ON,
  HEADLIGHT_DAY,
  HEADLIGHT_NIGHT,
  MAX_STEER_ANGLE,
  RUNNING_LIGHT_DAY,
  RUNNING_LIGHT_NIGHT,
  TURN_INDICATOR_OFF,
  TURN_INDICATOR_ON,
  type CarRig,
} from './carModel'

/**
 * Pure per-frame animator for a car rig.
 *
 * Kept free of React / engine internals so it can be unit-tested: it consumes
 * a snapshot of engine state and the rig, and drives the wheel / light nodes.
 *
 * Wheel rolling is driven by the *actual* distance the engine advanced this
 * frame (`Δdistance / tyre radius`) — never a timer. Steering is derived from
 * the heading curvature the engine actually traced (`atan(κ · wheelbase)`,
 * the bicycle model), so the front wheels point into the turn. When the car
 * is not advancing the roll and steering freeze.
 */

export interface CarVisualInputs {
  dt: number
  /** Night mode: headlights + beams on, running lights brightened. */
  night: boolean
  /** Phase of the indicator blink cycle (toggle every ~200 ms). */
  blinkOn: boolean
  /** Engine-mirrored state. */
  speed: number
  acceleration: number
  braking: number
  heading: number
  totalDistance: number
  turnType: TurnType | null
  laneChange: LaneChange | null
  /**
   * When set, the vehicle is being driven outside the engine (accident
   * override / event stop): roll comes from `speed * dt` and steering decays.
   */
  manual: boolean
  /**
   * 'auto' → derive brake lights from `braking`/`acceleration`;
   * 'on'/'off' → force them (accident stop).
   */
  brakeForce?: 'auto' | 'on' | 'off'
  /**
   * FAR/VERY FAR distance LOD: the animator keeps the hidden detail parts
   * (e.g. night beams) hidden instead of re-showing them.
   */
  lodFar?: boolean
}

/** Wrap an angular difference to (-π, π]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a <= -Math.PI) a += Math.PI * 2
  return a
}

/**
 * Steering angle (rad) the front wheels should show for the curvature traced
 * this frame, using the bicycle model `tan(δ) = κ · L`.
 */
export function steerAngleFor(dHeading: number, dDist: number, wheelbase: number): number {
  if (!(dDist > 1e-5) || !(wheelbase > 0)) return 0
  const curvature = dHeading / dDist
  return THREE.MathUtils.clamp(Math.atan(curvature * wheelbase), -MAX_STEER_ANGLE, MAX_STEER_ANGLE)
}

/** Which indicator sides should be lit for the given manoeuvre. */
export function indicatorSides(turnType: TurnType | null, laneChange: LaneChange | null): {
  left: boolean
  right: boolean
} {
  if (turnType === 'left') return { left: true, right: false }
  if (turnType === 'right') return { left: false, right: true }
  if (turnType === 'uturn') return { left: true, right: true }
  if (laneChange) {
    // Right-hand traffic: higher lane index = outer lane = right side.
    if (laneChange.toLaneIndex > laneChange.fromLaneIndex) return { left: false, right: true }
    if (laneChange.toLaneIndex < laneChange.fromLaneIndex) return { left: true, right: false }
  }
  return { left: false, right: false }
}

/**
 * Drive the rig from one frame of engine state.
 * Per-car persistent state (last distance / heading, accumulated roll, damped
 * steer) lives on the rig's userData.
 */
export function updateCarVisuals(rig: CarRig, input: CarVisualInputs): void {
  const ud = rig.group.userData as {
    lastDist: number
    lastHeading: number
    roll: number
    steer: number
  }
  if (!Number.isFinite(ud.lastDist)) {
    ud.lastDist = input.totalDistance
    ud.lastHeading = input.heading
    ud.roll = 0
    ud.steer = 0
  }

  const { wheelRadius, wheelbase } = rig
  const dt = Math.max(input.dt, 1e-5)

  /* Distance travelled this frame → wheel rotation. */
  let dDist: number
  if (input.manual) {
    dDist = Math.max(input.speed, 0) * dt
  } else {
    dDist = input.totalDistance - ud.lastDist
    // totalDistance resets to 0 on a reroute — ignore that negative jump.
    if (dDist < 0) dDist = 0
  }
  ud.lastDist = input.manual ? ud.lastDist : input.totalDistance
  ud.roll += dDist / wheelRadius
  for (const w of rig.wheels) w.roll.rotation.x = ud.roll

  /* Steering from the heading curvature actually traced this frame. */
  const dHeading = wrapAngle(input.heading - ud.lastHeading)
  ud.lastHeading = input.heading
  if (input.manual || dDist > 1e-5) {
    // Only aim at the target while moving; a vehicle stopped mid-turn keeps
    // its wheels turned (it will resume steering when it moves again).
    const target = input.manual ? 0 : steerAngleFor(dHeading, dDist, wheelbase)
    ud.steer = THREE.MathUtils.damp(ud.steer, target, 10, dt)
  }
  rig.wheels[0].steer.rotation.y = ud.steer
  rig.wheels[1].steer.rotation.y = ud.steer

  /* Brake / running lights. */
  const force = input.brakeForce ?? 'auto'
  const braking =
    force === 'on' || (force === 'auto' && (input.braking > 0.15 || input.acceleration < -0.4))
  rig.brakeMat.emissiveIntensity = braking ? BRAKE_LIGHT_ON : input.night ? RUNNING_LIGHT_NIGHT : RUNNING_LIGHT_DAY

  /* Headlights + fake beams at night (emissive only — no real lights). */
  rig.headMat.emissiveIntensity = input.night ? HEADLIGHT_NIGHT : HEADLIGHT_DAY
  for (const beam of rig.beams) beam.visible = input.night && !input.lodFar

  /* Turn indicators (blink driven by the frame clock, not a wheel timer). */
  const { left, right } = indicatorSides(input.turnType, input.laneChange)
  const lit = input.blinkOn
  rig.turnMatL.emissiveIntensity = left && lit ? TURN_INDICATOR_ON : TURN_INDICATOR_OFF
  rig.turnMatR.emissiveIntensity = right && lit ? TURN_INDICATOR_ON : TURN_INDICATOR_OFF
}
