import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { motion } from 'framer-motion'
import { AlertTriangle, Navigation, Layers, Satellite, Map as MapIcon, RotateCcw } from 'lucide-react'
import { incidentAPI } from '../../services/api'
import { useWebSocket } from '../../hooks/useWebSocket'
import { formatDate } from '../../utils/helpers'

const CITY_CENTER: [number, number] = [11.2448, 77.5017]

const tileLayers = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    name: 'Satellite',
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    name: 'Streets',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'OpenTopoMap',
    name: 'Terrain',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB',
    name: 'Dark',
  },
}

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
    position: [11.2465, 77.508] as [number, number],
    icon: '🚑',
  },
]

function createIncidentIcon(category: string) {
  const color = categoryColors[category] || '#6b7280'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
      </filter>
    </defs>
    <path d="M18 0C8.06 0 0 8.06 0 18c0 12.6 18 26 18 26s18-13.4 18-26C36 8.06 27.94 0 18 0z" fill="${color}" filter="url(#shadow)"/>
    <circle cx="18" cy="17" r="8" fill="white" fill-opacity="0.9"/>
    <circle cx="18" cy="17" r="4" fill="${color}"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  })
}

function createDepartmentIcon(emoji: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <defs>
      <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
    </defs>
    <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" filter="url(#ds)"/>
    <text x="16" y="20" text-anchor="middle" font-size="16">${emoji}</text>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  })
}

function createUserIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#3b82f6" stroke="white" stroke-width="3"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function MapViewController({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
  }, [center, map])
  return null
}

export default function MapPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [mapType, setMapType] = useState<keyof typeof tileLayers>('satellite')
  const [showDepartments, setShowDepartments] = useState(true)
  const [mapCenter, setMapCenter] = useState<[number, number]>(CITY_CENTER)

  useWebSocket((data: any) => {
    if (data.type === 'new_incident') {
      setIncidents((prev) => [data.incident, ...prev])
    }
  })

  useEffect(() => {
    loadIncidents()
  }, [])

  const loadIncidents = async () => {
    try {
      const res = await incidentAPI.list({ status: 'active', per_page: 100 })
      setIncidents(res.data.incidents || res.data || [])
    } catch (err) {
      console.error('Failed to load incidents:', err)
    }
  }

  const locateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          setUserLocation(loc)
          setMapCenter(loc)
        },
        () => {
          setUserLocation(CITY_CENTER)
          setMapCenter(CITY_CENTER)
        },
      )
    }
  }

  const filteredIncidents =
    selectedCategory === 'all' ? incidents : incidents.filter((i) => i.category === selectedCategory)

  const categories = ['all', 'accident', 'fire', 'flood', 'water_leak', 'power_outage', 'road_damage']

  const tile = tileLayers[mapType]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Live Incident Map</h1>
          <p className="text-xs text-slate-400">Real-time monitoring of Coimbatore city</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={locateUser}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Navigation className="w-3.5 h-3.5" />
            Locate Me
          </motion.button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-slate-200 shadow-lg relative">
        <MapContainer
          center={CITY_CENTER}
          zoom={13}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <MapViewController center={mapCenter} />

          {/* Tile Layer */}
          <TileLayer
            key={mapType}
            url={tile.url}
            attribution={tile.attribution}
            maxZoom={19}
          />

          {/* Department markers */}
          {showDepartments &&
            departmentLocations.map((dept) => (
              <Marker
                key={dept.name}
                position={dept.position}
                icon={createDepartmentIcon(dept.icon)}
              >
                <Popup>
                  <div className="p-1">
                    <p className="font-semibold text-sm">{dept.icon} {dept.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{dept.type} department</p>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* Incident markers */}
          {filteredIncidents
            .filter((i) => i.location?.latitude && i.location?.longitude)
            .map((incident) => (
              <Marker
                key={incident.id}
                position={[incident.location.latitude, incident.location.longitude]}
                icon={createIncidentIcon(incident.category)}
              >
              <Popup>
                <div className="p-1 min-w-[200px]">
                  <p className="font-semibold text-sm mb-1">{incident.title}</p>
                  <div className="space-y-0.5 text-xs text-gray-600">
                    <p><span className="font-medium">ID:</span> {incident.id?.slice(0, 8)}</p>
                    <p><span className="font-medium">Priority:</span> {incident.priority}</p>
                    <p><span className="font-medium">Category:</span> {incident.category}</p>
                    {incident.address && <p><span className="font-medium">Address:</span> {incident.address}</p>}
                    <p><span className="font-medium">Time:</span> {formatDate(incident.created_at)}</p>
                    {incident.ai_confidence && (
                      <p><span className="font-medium">AI Confidence:</span> {(incident.ai_confidence * 100).toFixed(1)}%</p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Warning zones for critical incidents */}
          {filteredIncidents
            .filter((i) => i.priority === 'CRITICAL' && i.location?.latitude && i.location?.longitude)
            .map((incident) => (
              <Circle
                key={`zone-${incident.id}`}
                center={[incident.location.latitude, incident.location.longitude]}
                radius={500}
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '8 4',
                }}
              />
            ))}

          {/* User location */}
          {userLocation && (
            <Marker position={userLocation} icon={createUserIcon()}>
              <Popup>
                <p className="text-xs font-medium">Your Location</p>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Map Controls Overlay */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          {/* Map Type Selector */}
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 p-1.5">
            {(Object.keys(tileLayers) as (keyof typeof tileLayers)[]).map((key) => (
              <button
                key={key}
                onClick={() => setMapType(key)}
                className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  mapType === key
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-500 hover:bg-slate-50 border border-transparent'
                }`}
              >
                {key === 'satellite' && <Satellite className="w-3 h-3" />}
                {key === 'streets' && <MapIcon className="w-3 h-3" />}
                {key === 'topo' && <Layers className="w-3 h-3" />}
                {key === 'dark' && <Layers className="w-3 h-3" />}
                {tileLayers[key].name}
              </button>
            ))}
          </div>

          {/* Department Toggle */}
          <button
            onClick={() => setShowDepartments(!showDepartments)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium shadow-lg border transition-all ${
              showDepartments
                ? 'bg-white/95 backdrop-blur-md text-blue-700 border-blue-200'
                : 'bg-white/95 backdrop-blur-md text-slate-400 border-slate-200'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            Departments
          </button>

          {/* Legend */}
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Legend</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(categoryColors).map(([cat, color]) => (
                <div key={cat} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-slate-500 capitalize">{cat.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]">
          <div className="flex gap-1.5 p-1.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/80">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {cat === 'all' ? 'All' : cat.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Incident Count */}
        <div className="absolute bottom-3 right-3 z-[1000]">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700">{filteredIncidents.length}</span>
            <span className="text-xs text-slate-400">active</span>
          </div>
        </div>
      </div>
    </div>
  )
}
