import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import { motion } from 'framer-motion'
import { Maximize2, AlertTriangle, Navigation } from 'lucide-react'
import { incidentAPI } from '../../services/api'
import { useWebSocket } from '../../hooks/useWebSocket'
import { formatDate } from '../../utils/helpers'

const CITY_CENTER: [number, number] = [11.2448, 77.5017]

const categoryColors: Record<string, string> = {
  accident: '#ef4444',
  water_leak: '#3b82f6',
  fire: '#f97316',
  power_outage: '#eab308',
  road_damage: '#6b7280',
  flood: '#06b6d4',
  gas_leak: '#ef4444',
  building_collapse: '#dc2626',
  other: '#6b7280',
}

const departmentLocations = [
  {
    name: 'Vijayamangalam Govt Hospital',
    type: 'hospital',
    position: [11.251, 77.505] as [number, number],
    icon: '🏥',
  },
  { name: 'Police Station', type: 'police', position: [11.241, 77.495] as [number, number], icon: '🚔' },
  { name: 'Fire Station', type: 'fire', position: [11.248, 77.497] as [number, number], icon: '🚒' },
  { name: 'Water Treatment Plant', type: 'water', position: [11.239, 77.51] as [number, number], icon: '💧' },
  { name: 'Power Station', type: 'power', position: [11.237, 77.496] as [number, number], icon: '⚡' },
  {
    name: 'Traffic Control Center',
    type: 'traffic',
    position: [11.25, 77.502] as [number, number],
    icon: '🚦',
  },
  {
    name: 'Disaster Response Center',
    type: 'disaster',
    position: [11.2448, 77.495] as [number, number],
    icon: '🛡️',
  },
  {
    name: 'Ambulance Station',
    type: 'ambulance',
    position: [11.241, 77.508] as [number, number],
    icon: '🚑',
  },
]

function createIcon(color: string, size: number = 30) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 12px ${color}80;animation:pulse 2s infinite;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function createLocationIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 0 6px rgba(37,99,235,0.25);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function createDeptIcon(emoji: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:8px;background:rgba(10,15,26,0.9);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:16px;backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(0,0,0,0.3);">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function IncidentMarker({
  position,
  color,
  incident,
}: {
  position: [number, number]
  color: string
  incident: any
}) {
  return (
    <Marker position={position} icon={createIcon(color, 32)}>
      <Popup>
        <div className="p-1.5 min-w-[220px] max-w-[280px]" style={{ fontFamily: 'Inter, sans-serif' }}>
          {incident.snapshot_url && (
            <img src={incident.snapshot_url} alt="" className="w-full h-28 object-cover rounded-lg mb-2" />
          )}
          <h3 className="font-bold text-gray-900 text-sm">{incident.title}</h3>
          <p className="text-[11px] text-gray-400 font-mono mt-0.5">{incident.incident_id}</p>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <span
              className="px-2 py-0.5 rounded text-[11px] text-white font-medium"
              style={{ background: color }}
            >
              {incident.priority}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600 capitalize">
              {incident.category?.replace('_', ' ')}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">{incident.location_address || 'No address'}</p>
          <p className="text-[11px] text-gray-400">{formatDate(incident.created_at)}</p>
          {incident.ai_risk_score && (
            <p className="text-[11px] text-blue-600 mt-1">
              AI Confidence: {(incident.ai_risk_score * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

export default function MapPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [map, setMap] = useState<L.Map | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPosition([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const centerOnUser = () => {
    if (userPosition && map) {
      map.setView(userPosition, 13)
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((p) => {
        const pos: [number, number] = [p.coords.latitude, p.coords.longitude]
        setUserPosition(pos)
        map?.setView(pos, 13)
      })
    }
  }

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await incidentAPI.list({ per_page: 100 })
        setIncidents(res.data.incidents)
      } catch (e) {
        console.error(e)
      }
    }
    fetchIncidents()
    const interval = setInterval(fetchIncidents, 15000)
    return () => clearInterval(interval)
  }, [])

  useWebSocket((msg) => {
    if (msg.type === 'incident' && msg.action === 'created') {
      setIncidents((prev) => [msg.data, ...prev])
    }
  })

  const filteredIncidents = filter === 'all' ? incidents : incidents.filter((inc) => inc.category === filter)
  const activeIncidents = filteredIncidents.filter((inc) =>
    ['reported', 'acknowledged', 'in_progress'].includes(inc.status)
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[calc(100vh-120px)] relative rounded-2xl overflow-hidden border border-slate-100"
    >
      {/* Filters */}
      <div className="absolute top-4 left-4 z-[1000] flex gap-1.5 flex-wrap">
        {['all', 'accident', 'fire', 'flood', 'water_leak', 'power_outage', 'road_damage'].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all backdrop-blur-md ${
              filter === cat
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            {cat === 'all' ? 'All' : cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Count */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-xl bg-white backdrop-blur-md border border-slate-200 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span className="text-xs text-slate-700 font-medium">{activeIncidents.length} Active</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] px-3 py-2.5 rounded-xl bg-white backdrop-blur-md border border-slate-200">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Legend</p>
        <div className="space-y-1">
          {Object.entries(categoryColors)
            .slice(0, 5)
            .map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] text-slate-500 capitalize">{cat.replace('_', ' ')}</span>
              </div>
            ))}
        </div>
      </div>

      <MapContainer
        center={CITY_CENTER}
        zoom={13}
        className="w-full h-full"
        ref={(ref) => {
          if (ref) {
            mapRef.current = ref
            setMap(ref)
          }
        }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {departmentLocations.map((dept, i) => (
          <Marker key={i} position={dept.position} icon={createDeptIcon(dept.icon)}>
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-gray-900 text-sm">{dept.name}</h3>
                <p className="text-[11px] text-gray-500 capitalize">{dept.type}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {userPosition && (
          <Marker position={userPosition} icon={createLocationIcon()}>
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-gray-900 text-sm">Your Location</h3>
                <p className="text-[11px] text-gray-500">Live position</p>
              </div>
            </Popup>
          </Marker>
        )}
        {activeIncidents.map((inc) => {
          if (!inc.latitude || !inc.longitude) return null
          return (
            <IncidentMarker
              key={inc.id}
              position={[inc.latitude, inc.longitude]}
              color={categoryColors[inc.category] || '#6b7280'}
              incident={inc}
            />
          )
        })}
        {activeIncidents
          .filter((i) => i.priority === 'critical')
          .map(
            (inc) =>
              inc.latitude &&
              inc.longitude && (
                <Circle
                  key={`zone-${inc.id}`}
                  center={[inc.latitude, inc.longitude]}
                  radius={500}
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1 }}
                />
              )
          )}
      </MapContainer>

      {/* Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-1.5">
        <button
          onClick={() => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
            else document.exitFullscreen?.()
          }}
          className="p-2 rounded-lg bg-white backdrop-blur-md border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={centerOnUser}
          className="p-2 rounded-lg bg-blue-500 border border-slate-300 text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600"
          title="Locate me"
        >
          <Navigation className="w-4 h-4" />
        </button>
      </div>

      <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.15);opacity:0.7} }`}</style>
    </motion.div>
  )
}
