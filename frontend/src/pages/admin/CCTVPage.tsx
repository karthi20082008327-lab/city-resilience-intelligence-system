import { motion } from 'framer-motion'
import { Smartphone, ExternalLink, AlertTriangle, Radio } from 'lucide-react'
import { useState, useEffect } from 'react'
import { incidentAPI } from '../../services/api'
import { useWebSocket } from '../../hooks/useWebSocket'

const simulatorCameras = [
  { id: 1, name: 'CAM-01 · Avenue Traffic Overview', location: 'Traffic Avenue', focus: 'traffic' },
  { id: 2, name: 'CAM-02 · Road Collapse & Pothole Zone', location: 'Highway', focus: 'road' },
  { id: 3, name: 'CAM-03 · Substation Power Grid', location: 'Power Grid', focus: 'grid' },
  { id: 4, name: 'CAM-04 · Underground Water Main', location: 'Water Main', focus: 'water' },
  { id: 5, name: 'CAM-05 · Emergency Response Dispatch', location: 'Emergency Zone', focus: 'emergency' },
]

const SIMUL_URL = '/simul/'

function SimulatorFeed({ camera }: { camera: (typeof simulatorCameras)[number] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="uc-card overflow-hidden group"
    >
      <div className="relative aspect-video bg-[#060a12] flex items-center justify-center overflow-hidden">
        {/* Embedded live simulator feed for this camera */}
        <iframe
          src={`${SIMUL_URL}?cam=${camera.id}&autotrack=0`}
          className="absolute inset-0 w-full h-full border-0"
          title={camera.name}
          loading="lazy"
        />

        {/* Live badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-white/80 font-mono">LIVE · CAM {camera.id}</span>
        </div>

        {/* Name */}
        <div className="absolute bottom-2.5 left-2.5 text-[11px] text-white/70 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
          {camera.name}
        </div>

        {/* Open full screen */}
        <a
          href={`${SIMUL_URL}?cam=${camera.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  )
}

export default function CCTVPage() {
  const [collisionIncidents, setCollisionIncidents] = useState<any[]>([])

  useEffect(() => {
    const fetchCollisions = async () => {
      try {
        const res = await incidentAPI.list({ category: 'accident', per_page: 5 })
        setCollisionIncidents(res.data.incidents || [])
      } catch {}
    }
    fetchCollisions()
  }, [])

  useWebSocket((msg) => {
    if (msg.type === 'incident' && msg.data?.category === 'accident') {
      setCollisionIncidents((prev) => [msg.data, ...prev.slice(0, 4)])
    }
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">CCTV Surveillance</h1>
          <p className="text-white/35 text-sm mt-0.5">
            {simulatorCameras.length} simulation cameras live · City Digital Twin
          </p>
        </div>
        <a
          href="/simul/"
          target="_blank"
          rel="noopener noreferrer"
          className="uc-btn uc-btn-primary text-xs py-2 px-3"
        >
          Open Digital Twin <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Mobile Detection */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="uc-card p-6 border border-blue-500/10"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/15">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Mobile Collision Detection</h3>
              <p className="text-xs text-white/35">Use your phone camera as an AI-powered detector</p>
            </div>
          </div>
          <a
            href="/detect"
            target="_blank"
            rel="noopener noreferrer"
            className="uc-btn uc-btn-primary text-xs py-2 px-3"
          >
            Open Detector <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              label: 'How to use',
              text: 'Open the detector on your phone, point at traffic, and collisions are auto-reported.',
            },
            {
              label: 'AI Model',
              text: 'YOLOv8 + TensorFlow.js runs entirely in your browser. No video is streamed.',
            },
            {
              label: 'Auto-Report',
              text: 'When a collision is detected, a screenshot is captured and an incident is created.',
            },
          ].map((item) => (
            <div key={item.label} className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
              <p className="text-[11px] text-white/30 mb-1 uppercase tracking-wider">{item.label}</p>
              <p className="text-xs text-white/50 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        {collisionIncidents.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-white/40 mb-2">Recent Collision Reports</h4>
            <div className="space-y-1.5">
              {collisionIncidents.map((inc: any) => (
                <div
                  key={inc.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-red-500/[0.04] border border-red-500/10"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 truncate">{inc.title}</p>
                    <p className="text-[11px] text-white/30 font-mono">{inc.incident_id}</p>
                  </div>
                  {inc.snapshot_url && (
                    <img
                      src={inc.snapshot_url}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover ring-1 ring-white/10"
                    />
                  )}
                  <span className="uc-chip bg-red-500/10 text-red-400">{inc.priority}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Simulator Camera Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            City Digital Twin — Live Cameras
          </h2>
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span>Any incident in the twin auto-captures a snapshot & reports it to the Incidents page</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {simulatorCameras.map((camera) => (
            <SimulatorFeed key={camera.id} camera={camera} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
