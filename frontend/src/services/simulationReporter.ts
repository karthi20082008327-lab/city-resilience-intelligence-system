import { incidentAPI } from './api'
import { createIncidentReporter } from '../simulation/incidentReporter'

/**
 * Best-effort reporting of simulation events to the CRIS backend so they
 * appear on the admin dashboard and get routed to the correct department.
 *
 * Client-side dedup mirrors the backend /api/stream/verify dedup: a given
 * category at a given location is only reported once per cooldown window,
 * preventing duplicate incidents when a condition persists across ticks.
 */

// Mirrors backend app/core/settings.py CITY_LAT / CITY_LON (Vijayamangalam).
const CITY_LAT = 11.2448
const CITY_LON = 77.5017

export interface SimReportInput {
  category: 'accident' | 'water_leak' | 'fire' | 'road_damage' | 'flood'
  title: string
  description: string
  locationLabel: string
  /** Stable dedup key for this event location (e.g. "sector4"). */
  locationKey: string
  /** Simulation-space coordinates (currently for diagnostics). */
  location: { x: number; z: number }
  /** Optional camera name if triggered by a CCTV camera. */
  cameraName?: string
}

const reporter = createIncidentReporter({ cooldownMs: 5_000 })

/**
 * Capture a JPEG snapshot from the currently active WebGL canvas.
 * Returns a base64 data-URI string or null if no canvas is available.
 */
function captureCanvasSnapshot(): string | null {
  try {
    const canvas = document.querySelector('canvas')
    if (!canvas) return null
    // Use lower quality and smaller size to avoid oversized payloads
    const tempCanvas = document.createElement('canvas')
    const maxDim = 640
    const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height, 1)
    tempCanvas.width = canvas.width * scale
    tempCanvas.height = canvas.height * scale
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height)
    return tempCanvas.toDataURL('image/jpeg', 0.5)
  } catch {
    return null
  }
}

/**
 * Show a brief on-screen notification so the user knows an incident was reported.
 */
function showNotification(message: string, type: 'success' | 'error') {
  try {
    const existing = document.getElementById('cris-sim-notification')
    if (existing) existing.remove()

    const div = document.createElement('div')
    div.id = 'cris-sim-notification'
    div.textContent = message
    div.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 99999;
      padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
      color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s; opacity: 1;
      background: ${type === 'success' ? '#22c55e' : '#ef4444'};
    `
    document.body.appendChild(div)
    setTimeout(() => { div.style.opacity = '0' }, 3000)
    setTimeout(() => { div.remove() }, 3500)
  } catch { /* ignore */ }
}

/**
 * Returns true when the incident was accepted for reporting (i.e. not a
 * duplicate within the cooldown window).
 */
export function reportSimulationIncident(input: SimReportInput): boolean {
  const now = Date.now()
  if (!reporter.shouldReport(input.category, input.locationKey, now)) {
    console.log(`[SIM] Cooldown active for ${input.category}@${input.locationKey}, skipping`)
    return false
  }
  reporter.markReported(input.category, input.locationKey, now)

  const snapshot = captureCanvasSnapshot()

  console.log(`[SIM] Reporting ${input.category} incident: ${input.title}`)

  void incidentAPI
    .create({
      category: input.category,
      title: input.title,
      description: input.description,
      latitude: CITY_LAT,
      longitude: CITY_LON,
      location_address: input.locationLabel,
      reporter_name: 'CRIS Simulation',
      camera_name: input.cameraName,
      snapshot_base64: snapshot || undefined,
    })
    .then((res) => {
      console.log(`[SIM] Incident created successfully: ${res.data.incident_id}`)
      showNotification(`Incident ${res.data.incident_id} created`, 'success')
    })
    .catch((err) => {
      const status = err.response?.status
      const detail = err.response?.data?.detail || err.message
      console.error(`[SIM] Failed to report incident: ${status} — ${detail}`)
      showNotification(`Failed: ${status || 'Network error'} — ${detail}`, 'error')
    })

  return true
}
