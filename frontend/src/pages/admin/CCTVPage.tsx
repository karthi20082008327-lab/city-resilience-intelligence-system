import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, AlertTriangle, Wifi, WifiOff } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { incidentAPI } from '../../services/api'
import { useWebSocket } from '../../hooks/useWebSocket'
import SimulationCameraFeed, {
  CCTV_PRESETS,
  CameraPreset,
} from '../../components/simulation/SimulationCameraFeed'

const simulatorCameras = [
  { id: 1, name: 'CAM-01 · Main Junction', location: 'Road Intersection', focus: 'traffic' },
  { id: 2, name: 'CAM-02 · Tower B2 Fire Zone', location: 'Building Zone', focus: 'road' },
  { id: 3, name: 'CAM-03 · SE Crossroads', location: 'Sector 3', focus: 'grid' },
  { id: 4, name: 'CAM-04 · NW Water Main', location: 'Underground Zone', focus: 'water' },
  { id: 5, name: 'CAM-05 · East Expressway', location: 'Eastern Corridor', focus: 'emergency' },
]

interface CameraFocusEvent {
  camera_id?: number | string
  camera_name?: string
  category?: string
  title?: string
  incident_id?: string
  priority?: string
  snapshot_url?: string
}

function SimulatorFeed({
  camera,
  alert,
}: {
  camera: (typeof simulatorCameras)[number]
  alert?: CameraFocusEvent | null
}) {
  const isIncident = !!alert
  const preset: CameraPreset = CCTV_PRESETS[camera.focus] || CCTV_PRESETS.traffic

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`uc-card overflow-hidden group ${isIncident ? 'ring-2 ring-red-500 shadow-lg shadow-red-500/20' : ''}`}
    >
      <div className="relative aspect-video bg-[#060a12] flex items-center justify-center overflow-hidden">
        <SimulationCameraFeed preset={preset} cameraId={camera.id} />
        {/* Camera label */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur-sm z-10">
          <span className={`w-1.5 h-1.5 rounded-full ${isIncident ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'}`} />
          <span className="text-[10px] font-mono text-white/80">{camera.name.split('·')[0].trim()}</span>
        </div>
        {isIncident && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-600/90 backdrop-blur-sm z-10">
            <span className="text-[10px] font-bold text-white animate-pulse">INCIDENT</span>
          </div>
        )}
        <a
          href="/admin/simulation"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-colors z-10"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  )
}

/**
 * Live mobile camera feed tile. Shows the phone's camera feed via a <video>
 * element that mirrors the user's camera stream in real-time.
 */
function MobileCameraFeed({ alert }: { alert: CameraFocusEvent | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [connected, setConnected] = useState(false)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setConnected(true)
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [startCamera])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`uc-card overflow-hidden ${alert ? 'ring-2 ring-red-500 shadow-lg shadow-red-500/30' : ''}`}
    >
      <div className="relative aspect-video bg-[#060a12] overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        {/* Label */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur-sm z-10">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} />
          <span className="text-[10px] font-mono text-white/80">MOBILE</span>
          {connected ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
        </div>

        {/* Collision Alert Overlay */}
        <AnimatePresence>
          {alert && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-2 left-2 right-2 bg-red-600/95 rounded-lg p-3 border border-red-400 shadow-lg shadow-red-500/50 z-10"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white animate-pulse" />
                <div>
                  <p className="text-sm font-bold text-white">COLLISION DETECTED</p>
                  <p className="text-xs text-white/80">{alert.title || 'Two vehicles collided'}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <a
          href="/detect"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-colors z-10"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  )
}

export default function CCTVPage() {
  const [collisionIncidents, setCollisionIncidents] = useState<any[]>([])
  const [activeFocus, setActiveFocus] = useState<CameraFocusEvent | null>(null)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const [mobileAlert, setMobileAlert] = useState<CameraFocusEvent | null>(null)

  // Fetch initial collision incidents
  useEffect(() => {
    const fetchCollisions = async () => {
      try {
        const res = await incidentAPI.list({ category: 'accident', per_page: 10 })
        setCollisionIncidents(res.data.incidents || [])
      } catch {}
    }
    fetchCollisions()
  }, [])

  // Handle WebSocket messages — instant collision alerts
  useWebSocket((msg) => {
    if (msg.type === 'incident') {
      if (msg.data?.category === 'accident') {
        // Add new collision to the top of the list INSTANTLY
        setCollisionIncidents((prev) => [msg.data, ...prev.slice(0, 9)])

        // Flash the mobile camera tile
        setMobileAlert({
          camera_name: msg.data.camera_name || 'Mobile Camera',
          category: msg.data.category,
          title: msg.data.title,
          incident_id: msg.data.incident_id,
          priority: msg.data.priority,
          snapshot_url: msg.data.snapshot_url,
        })
        setLastEventAt(Date.now())
      }

      // Camera focus for CCTV simulation cameras
      if (msg.data?.camera_id) {
        setActiveFocus({
          camera_id: msg.data.camera_id,
          camera_name: msg.data.camera_name,
          category: msg.data.category,
          title: msg.data.title,
          incident_id: msg.data.incident_id,
          priority: msg.data.priority,
          snapshot_url: msg.data.snapshot_url,
        })
        setLastEventAt(Date.now())
      }
    } else if (msg.type === 'camera_focus') {
      setActiveFocus(msg.data ?? null)
      setLastEventAt(Date.now())
    }
  })

  // Auto-clear alerts after 10 seconds
  useEffect(() => {
    if (!lastEventAt) return
    const t = setTimeout(() => {
      setActiveFocus(null)
      setMobileAlert(null)
    }, 10000)
    return () => clearTimeout(t)
  }, [lastEventAt])

  const incidentCameraId = activeFocus?.camera_id ? Number(activeFocus.camera_id) : null

  const sortedCameras = incidentCameraId
    ? [...simulatorCameras].sort((a, b) => {
        if (a.id === incidentCameraId) return -1
        if (b.id === incidentCameraId) return 1
        return a.id - b.id
      })
    : simulatorCameras

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">CCTV Surveillance</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {simulatorCameras.length + 1} cameras live · 3D City + Mobile Detection · Real-time collision alerts
          </p>
        </div>
        <a
          href="/admin/simulation"
          target="_blank"
          rel="noopener noreferrer"
          className="uc-btn uc-btn-primary text-xs py-2 px-3"
        >
          Open Digital Twin <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Camera Grid — 6 tiles: 5 simulation + 1 mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Mobile Camera — first position when there's an alert, otherwise last */}
        {mobileAlert ? (
          <MobileCameraFeed alert={mobileAlert} />
        ) : (
          <MobileCameraFeed alert={null} />
        )}

        {/* 5 Simulation cameras */}
        {sortedCameras.map((cam) => (
          <SimulatorFeed
            key={cam.id}
            camera={cam}
            alert={incidentCameraId === cam.id ? activeFocus : null}
          />
        ))}
      </div>

      {/* Collision Incidents List */}
      <div className="uc-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="text-sm font-semibold text-slate-900">Collision Reports</h3>
          <span className="ml-auto text-xs text-slate-400">{collisionIncidents.length} incidents</span>
        </div>

        {collisionIncidents.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No collisions detected yet. Point your mobile camera at two cars to test.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            <AnimatePresence>
              {collisionIncidents.map((inc, i) => (
                <motion.div
                  key={inc.incident_id || i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-red-50 hover:border-red-200 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{inc.title}</p>
                    <p className="text-xs text-slate-500 truncate">{inc.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-mono text-slate-400">{inc.incident_id}</span>
                      <span className="text-[10px] text-slate-400">
                        {inc.created_at ? new Date(inc.created_at).toLocaleTimeString() : ''}
                      </span>
                      {inc.snapshot_url && (
                        <span className="text-[10px] text-emerald-600 font-medium">Has Image</span>
                      )}
                    </div>
                  </div>
                  {inc.snapshot_url && (
                    <img
                      src={inc.snapshot_url}
                      alt="Collision snapshot"
                      className="w-16 h-12 object-cover rounded border border-slate-200"
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}
