import { useRef, useEffect, useState, useCallback } from 'react'
import { UcripLogo } from '../../components/UcripLogo'

interface TrackedObject {
  id: number
  class: string
  bbox: number[]
  confidence: number
}

interface StreamAlert {
  type: string
  confidence: number
  description?: string
}

export default function MobileDetectPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sendIntervalRef = useRef<number | null>(null)
  const detectingRef = useRef(false)

  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [cameraActive, setCameraActive] = useState(false)
  const [fps, setFps] = useState(0)
  const [objectCount, setObjectCount] = useState(0)
  const [trackedObjects, setTrackedObjects] = useState<TrackedObject[]>([])
  const [alert, setAlert] = useState<StreamAlert | null>(null)
  const [annotatedFrame, setAnnotatedFrame] = useState<string>('')
  const [cameraName] = useState('Mobile Camera 1')
  const [errorMessage, setErrorMessage] = useState('')

  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/stream`
  }, [])

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    setWsStatus('connecting')
    const ws = new WebSocket(getWsUrl())
    ws.onopen = () => {
      setWsStatus('connected')
      ws.send(
        JSON.stringify({ type: 'config', camera_name: cameraName, latitude: 11.3128, longitude: 77.4909 })
      )
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'status') {
          setFps(msg.fps || 0)
          setObjectCount(msg.objects || 0)
          setTrackedObjects(msg.tracked || [])
          if (msg.annotated_frame) setAnnotatedFrame(`data:image/jpeg;base64,${msg.annotated_frame}`)
          if (msg.alert) {
            setAlert(msg.alert)
            setTimeout(() => setAlert(null), 15000)
          }
        }
      } catch {}
    }
    ws.onclose = () => {
      setWsStatus('disconnected')
      setTimeout(connectWebSocket, 3000)
    }
    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [cameraName, getWsUrl])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
      setErrorMessage('')
      connectWebSocket()
    } catch {
      setErrorMessage('Camera access denied. Please allow camera access.')
    }
  }, [connectWebSocket])

  const stopCamera = useCallback(() => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current)
      sendIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setCameraActive(false)
    setWsStatus('disconnected')
    setFps(0)
    setObjectCount(0)
    setTrackedObjects([])
    setAnnotatedFrame('')
  }, [])

  const sendFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ws = wsRef.current
    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return
    if (video.paused || video.ended || detectingRef.current) return
    detectingRef.current = true
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const maxDim = 320
      const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const reader = new FileReader()
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1]
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'frame', data: base64 }))
              detectingRef.current = false
            }
            reader.readAsDataURL(blob)
          } else {
            detectingRef.current = false
          }
        },
        'image/jpeg',
        0.4
      )
    } else {
      detectingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (cameraActive) sendIntervalRef.current = window.setInterval(sendFrame, 300)
    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current)
    }
  }, [cameraActive, sendFrame])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  const classColors: Record<string, string> = {
    person: '#22c55e',
    car: '#3b82f6',
    motorcycle: '#f59e0b',
    bus: '#8b5cf6',
    truck: '#ef4444',
    vehicle: '#3b82f6',
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <header className="bg-[rgba(10,15,26,0.9)] backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <UcripLogo className="w-8 h-8" />
          <h1 className="text-sm font-bold">UCRIP CCTV</h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-white/40 font-mono">{fps} FPS</span>
          <span
            className={`px-2 py-0.5 rounded-full font-medium ${
              wsStatus === 'connected'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : wsStatus === 'connecting'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-white/[0.04] text-white/30 border border-white/[0.06]'
            }`}
          >
            {wsStatus === 'connected'
              ? 'AI CONNECTED'
              : wsStatus === 'connecting'
                ? 'CONNECTING...'
                : 'OFFLINE'}
          </span>
        </div>
      </header>

      <main className="relative">
        <div className="relative w-full" style={{ aspectRatio: '4/3' }}>
          {annotatedFrame && cameraActive ? (
            <img src={annotatedFrame} className="w-full h-full object-cover bg-black" alt="" />
          ) : (
            <video ref={videoRef} className="w-full h-full object-cover bg-black" playsInline muted />
          )}
          <canvas ref={canvasRef} className="hidden" />

          {!cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-white/20"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <p className="text-white/50 mb-1 text-sm">AI-Powered CCTV</p>
                <p className="text-white/20 text-xs mb-5">Accident + Fire Detection via AI Pipeline</p>
                {errorMessage && <p className="text-red-400 text-sm mb-3">{errorMessage}</p>}
                <button onClick={startCamera} className="uc-btn uc-btn-primary px-6 py-2.5">
                  Start Monitoring
                </button>
              </div>
            </div>
          )}

          {cameraActive && (
            <>
              <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[11px] font-mono text-white/70">AI SCANNING</span>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm">
                  <span className="text-[11px] font-mono text-white/50">{objectCount} objects</span>
                </div>
              </div>

              {alert && (
                <div
                  className={`absolute bottom-3 left-3 right-3 backdrop-blur-sm rounded-xl p-4 border ${
                    alert.type === 'accident'
                      ? 'bg-red-950/90 border-red-500/30'
                      : 'bg-orange-950/90 border-orange-500/30'
                  }`}
                >
                  <p
                    className={`font-bold text-sm ${alert.type === 'accident' ? 'text-red-200' : 'text-orange-200'}`}
                  >
                    {alert.type === 'accident'
                      ? 'ACCIDENT DETECTED'
                      : alert.type === 'fire'
                        ? 'FIRE DETECTED'
                        : 'SMOKE DETECTED'}
                  </p>
                  <p
                    className={`text-xs ${alert.type === 'accident' ? 'text-red-300/70' : 'text-orange-300/70'}`}
                  >
                    Confidence: {(alert.confidence * 100).toFixed(0)}% - Report sent to admin
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="uc-card p-3 text-center">
              <p className="text-xl font-bold text-blue-400">{objectCount}</p>
              <p className="text-[11px] text-white/25 mt-0.5">Tracked</p>
            </div>
            <div className="uc-card p-3 text-center">
              <p className="text-xl font-bold text-emerald-400">{fps}</p>
              <p className="text-[11px] text-white/25 mt-0.5">FPS</p>
            </div>
            <div className="uc-card p-3 text-center">
              <p
                className={`text-xl font-bold ${wsStatus === 'connected' ? 'text-purple-400' : 'text-white/20'}`}
              >
                {wsStatus === 'connected' ? 'ON' : 'OFF'}
              </p>
              <p className="text-[11px] text-white/25 mt-0.5">AI Engine</p>
            </div>
          </div>

          {trackedObjects.length > 0 && (
            <div className="uc-card p-4">
              <h3 className="text-xs font-medium text-white/40 mb-2">Live Tracking</h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {trackedObjects.map((obj) => (
                  <div key={obj.id} className="flex justify-between text-sm items-center py-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: classColors[obj.class] || '#fff' }}
                      />
                      <span className="text-white/50 capitalize text-xs">{obj.class}</span>
                      <span className="text-white/20 text-[10px]">#{obj.id}</span>
                    </div>
                    <span className="text-emerald-400 font-mono text-xs">
                      {(obj.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {cameraActive ? (
              <button
                onClick={stopCamera}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                Stop Monitoring
              </button>
            ) : (
              <button
                onClick={startCamera}
                className="flex-1 py-3 rounded-xl text-sm font-medium uc-btn-primary"
              >
                Start Monitoring
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
