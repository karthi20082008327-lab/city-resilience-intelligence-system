import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Flame, X, CheckCircle, XCircle, Radio, MapPin, Clock, Camera } from 'lucide-react'

interface IncidentAlertProps {
  incident: any
  onAccept?: (id: string) => void
  onReject?: (id: string) => void
  onDispatch?: (id: string) => void
  onDismiss?: () => void
}

export default function IncidentAlert({
  incident,
  onAccept,
  onReject,
  onDispatch,
  onDismiss,
}: IncidentAlertProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (incident) {
      setShow(true)
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(
            'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip+LdkNCZn+Fj4FfT1Zqe4eXjGNHTGd9h5iOaUxOaH2Jm5FqTE5ofYmbk2pMTmh9iZuTakxOaH2Jm5NqTE5ofYmbk2pMTmh9iZuTakxOaH2Jm5NqTE5ofYmbk2pMTmh9iZuTakxOaA=='
          )
          audioRef.current.loop = true
          audioRef.current.volume = 0.5
          audioRef.current.play().catch(() => {})
        }
      } catch {}
    } else {
      setShow(false)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [incident])

  if (!incident) return null

  const isAccident = incident.category === 'accident' || incident.detection_type === 'accident'
  const isFire = incident.category === 'fire' || incident.detection_type === 'fire'
  const accentColor = isAccident ? '#ef4444' : isFire ? '#f97316' : '#f59e0b'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 right-4 z-[9999] w-[400px] overflow-hidden"
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(24px)',
            border: `1px solid ${accentColor}50`,
            borderRadius: '16px',
            boxShadow: `0 24px 48px rgba(15,23,42,0.15), 0 0 40px ${accentColor}20`,
          }}
        >
          {/* Header */}
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{ background: `${accentColor}12`, borderBottom: `1px solid ${accentColor}30` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse"
                style={{ background: `${accentColor}20` }}
              >
                {isAccident ? (
                  <AlertTriangle className="w-5 h-5" style={{ color: accentColor }} />
                ) : (
                  <Flame className="w-5 h-5" style={{ color: accentColor }} />
                )}
              </div>
              <div>
                <p className="text-slate-900 font-bold text-sm tracking-wide uppercase">
                  {isAccident ? 'Accident Detected' : isFire ? 'Fire Detected' : 'Smoke Detected'}
                </p>
                <p className="text-slate-500 text-xs font-mono mt-0.5">{incident.incident_id}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setShow(false)
                onDismiss?.()
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Snapshot */}
          {incident.snapshot_url && (
            <div className="relative h-44 bg-slate-900">
              <img src={incident.snapshot_url} alt="Incident" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                <Camera className="w-3 h-3" style={{ color: accentColor }} />
                <span className="text-xs text-white font-mono">SNAPSHOT</span>
              </div>
              {incident.video_url && (
                <a
                  href={incident.video_url}
                  target="_blank"
                  rel="noopener"
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ background: accentColor }}
                >
                  Play 5s Clip
                </a>
              )}
            </div>
          )}

          {/* Details */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-slate-700">{incident.location_address || 'Location unknown'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-slate-700">{new Date(incident.created_at).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Radio className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-slate-700">{incident.camera_name || 'AI Camera'}</span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase"
                style={{
                  background: `${accentColor}15`,
                  color: accentColor,
                  border: `1px solid ${accentColor}30`,
                }}
              >
                {incident.priority}
              </span>
              <span className="text-xs text-slate-500">
                Confidence: {((incident.ai_risk_score || incident.confidence || 0) * 100).toFixed(0)}%
              </span>
            </div>

            {incident.ai_recommendation && (
              <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
                {incident.ai_recommendation}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onAccept?.(incident.incident_id)
                  setShow(false)
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Accept
              </button>
              <button
                onClick={() => {
                  onDispatch?.(incident.incident_id)
                  setShow(false)
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-100"
              >
                <Radio className="w-3.5 h-3.5" /> Dispatch
              </button>
              <button
                onClick={() => {
                  onReject?.(incident.incident_id)
                  setShow(false)
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
