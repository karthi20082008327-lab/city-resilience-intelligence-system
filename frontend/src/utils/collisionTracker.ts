export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Detection {
  class: string
  classId: number
  score: number
  bbox: BoundingBox
}

export interface TrackedVehicle {
  id: string
  class: string
  bbox: BoundingBox
  center: { x: number; y: number }
  velocity: { x: number; y: number }
  framesTracked: number
  lastSeen: number
}

export interface CollisionEvent {
  vehicle1: TrackedVehicle
  vehicle2: TrackedVehicle
  iou: number
  closingSpeed: number
  timestamp: number
}

const VEHICLE_CLASSES = ['car', 'truck', 'bus', 'motorcycle']
const VEHICLE_CLASS_IDS = [3, 6, 7, 4]

let nextTrackId = 0

function generateTrackId(): string {
  return `v_${nextTrackId++}`
}

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  const union = areaA + areaB - intersection
  return union > 0 ? intersection / union : 0
}

function centerDistance(a: BoundingBox, b: BoundingBox): number {
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  const bx = b.x + b.width / 2
  const by = b.y + b.height / 2
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

export class CollisionTracker {
  private tracks: Map<string, TrackedVehicle> = new Map()
  private lastFrameTime: number = Date.now()
  private collisionCooldown: boolean = false
  private collisionCooldownStart: number = 0
  private readonly COOLDOWN_MS = 30000
  private readonly MAX_TRACK_AGE_MS = 1000
  private readonly IOU_MATCH_THRESHOLD = 0.3
  private readonly COLLISION_IOU_THRESHOLD = 0.2
  private readonly CLOSING_SPEED_THRESHOLD = 80
  private frameCount: number = 0

  filterVehicleDetections(detections: Detection[]): Detection[] {
    return detections.filter(
      (d) => VEHICLE_CLASSES.includes(d.class) || VEHICLE_CLASS_IDS.includes(d.classId)
    )
  }

  update(vehicleDetections: Detection[]): CollisionEvent | null {
    this.frameCount++
    const now = Date.now()
    const dt = (now - this.lastFrameTime) / 1000
    this.lastFrameTime = now

    for (const [id, track] of this.tracks) {
      if (now - track.lastSeen > this.MAX_TRACK_AGE_MS) {
        this.tracks.delete(id)
      }
    }

    const matched = new Set<string>()
    const matchedDetections = new Set<number>()

    for (const detection of vehicleDetections) {
      let bestId: string | null = null
      let bestIoU = 0

      for (const [id, track] of this.tracks) {
        if (matched.has(id)) continue
        const iou = computeIoU(track.bbox, detection.bbox)
        if (iou > bestIoU && iou > this.IOU_MATCH_THRESHOLD) {
          bestIoU = iou
          bestId = id
        }
      }

      if (bestId) {
        const track = this.tracks.get(bestId)!
        const newCenter = {
          x: detection.bbox.x + detection.bbox.width / 2,
          y: detection.bbox.y + detection.bbox.height / 2,
        }
        const velocity =
          dt > 0
            ? {
                x: (newCenter.x - track.center.x) / dt,
                y: (newCenter.y - track.center.y) / dt,
              }
            : track.velocity

        this.tracks.set(bestId, {
          ...track,
          bbox: detection.bbox,
          center: newCenter,
          velocity,
          framesTracked: track.framesTracked + 1,
          lastSeen: now,
        })
        matched.add(bestId)
        matchedDetections.add(vehicleDetections.indexOf(detection))
      }
    }

    for (let i = 0; i < vehicleDetections.length; i++) {
      if (!matchedDetections.has(i)) {
        const det = vehicleDetections[i]
        const id = generateTrackId()
        const center = {
          x: det.bbox.x + det.bbox.width / 2,
          y: det.bbox.y + det.bbox.height / 2,
        }
        this.tracks.set(id, {
          id,
          class: det.class,
          bbox: det.bbox,
          center,
          velocity: { x: 0, y: 0 },
          framesTracked: 1,
          lastSeen: now,
        })
      }
    }

    if (this.collisionCooldown) {
      if (now - this.collisionCooldownStart > this.COOLDOWN_MS) {
        this.collisionCooldown = false
      }
      return null
    }

    const trackArray = Array.from(this.tracks.values())
    for (let i = 0; i < trackArray.length; i++) {
      for (let j = i + 1; j < trackArray.length; j++) {
        const t1 = trackArray[i]
        const t2 = trackArray[j]
        if (t1.framesTracked < 3 || t2.framesTracked < 3) continue

        const iou = computeIoU(t1.bbox, t2.bbox)
        const dist = centerDistance(t1.bbox, t2.bbox)

        const closingSpeed =
          -(
            (t1.center.x - t2.center.x) * (t1.velocity.x - t2.velocity.x) +
            (t1.center.y - t2.center.y) * (t1.velocity.y - t2.velocity.y)
          ) / (dist || 1)

        const isOverlapping = iou > this.COLLISION_IOU_THRESHOLD
        const isClosingFast = closingSpeed > this.CLOSING_SPEED_THRESHOLD
        const isVeryClose = dist < 100

        if ((isOverlapping && isClosingFast) || (isOverlapping && isVeryClose)) {
          this.collisionCooldown = true
          this.collisionCooldownStart = now
          return {
            vehicle1: t1,
            vehicle2: t2,
            iou,
            closingSpeed,
            timestamp: now,
          }
        }
      }
    }

    return null
  }

  getActiveVehicles(): TrackedVehicle[] {
    return Array.from(this.tracks.values())
  }

  getVehicleCount(): number {
    return this.tracks.size
  }

  reset(): void {
    this.tracks.clear()
    this.collisionCooldown = false
    this.frameCount = 0
  }
}
