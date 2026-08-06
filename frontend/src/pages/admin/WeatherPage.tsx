import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Thermometer, Droplets, Wind, Gauge, CloudRain, Sun, AlertTriangle } from 'lucide-react'
import { weatherAPI } from '../../services/api'

const weatherIcons: Record<string, string> = {
  '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️', '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️', '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌧️',
  '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️', '50d': '🌫️', '50n': '🌫️',
}

export default function WeatherPage() {
  const [weather, setWeather] = useState<any>(null)
  const [risk, setRisk] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const [weatherRes, riskRes] = await Promise.all([weatherAPI.getCurrent(), weatherAPI.getRisk()])
        setWeather(weatherRes.data)
        setRisk(riskRes.data)
        setLastUpdate(new Date())
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    fetchWeather()
    const interval = setInterval(fetchWeather, 300000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="uc-card p-5"><div className="uc-skeleton h-4 w-1/2 mb-3" /><div className="uc-skeleton h-8 w-1/3" /></div>
        ))}
      </div>
    )
  }

  if (!weather) return null

  const stats = [
    { label: 'Temperature', value: `${weather.temperature}°C`, icon: Thermometer, color: '#f97316' },
    { label: 'Humidity', value: `${weather.humidity}%`, icon: Droplets, color: '#3b82f6' },
    { label: 'Wind Speed', value: `${weather.wind_speed} km/h`, icon: Wind, color: '#06b6d4' },
    { label: 'Pressure', value: `${weather.pressure} hPa`, icon: Gauge, color: '#8b5cf6' },
    { label: 'Rain Probability', value: `${weather.rain_probability}%`, icon: CloudRain, color: '#6366f1' },
    { label: 'UV Index', value: weather.uv_index.toFixed(1), icon: Sun, color: '#eab308' },
  ]

  const getUVLevel = (uv: number) => {
    if (uv <= 2) return { label: 'Low', color: 'text-emerald-400' }
    if (uv <= 5) return { label: 'Moderate', color: 'text-amber-400' }
    if (uv <= 7) return { label: 'High', color: 'text-orange-400' }
    if (uv <= 10) return { label: 'Very High', color: 'text-red-400' }
    return { label: 'Extreme', color: 'text-purple-400' }
  }

  const uvLevel = getUVLevel(weather.uv_index)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Weather Intelligence</h1>
          <p className="text-white/35 text-sm mt-0.5">Real-time weather data for {weather.city}</p>
        </div>
        <span className="text-[11px] text-white/25">Updated {lastUpdate.toLocaleTimeString()}</span>
      </div>

      {/* Main Weather Hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="uc-card p-8 uc-glow-border">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="text-white/30 text-sm">{weather.city}, {weather.country}</p>
            <div className="text-6xl md:text-7xl font-bold text-white my-2 tracking-tight">
              {weather.temperature}°<span className="text-3xl text-white/30 font-normal">C</span>
            </div>
            <p className="text-lg text-white/60">{weather.description}</p>
            <p className="text-sm text-white/25 mt-1">Feels like {weather.temperature}°C</p>
          </div>
          <div className="text-8xl">{weatherIcons[weather.icon] || '🌤️'}</div>
        </div>
      </motion.div>

      {/* AI Risk Alert */}
      {risk && risk.flood_risk > 0.3 && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="uc-card p-5 border border-red-500/20 bg-red-500/[0.04]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-400">AI Weather Alert</h3>
              <p className="text-white/50 text-sm mt-1">{risk.recommendation}</p>
              <div className="flex gap-4 mt-2">
                <span className="text-xs text-white/35">Flood Risk: <span className="text-red-400 font-semibold">{(risk.flood_risk * 100).toFixed(0)}%</span></span>
                <span className="text-xs text-white/35">Overall: <span className="text-amber-400 font-semibold">{(risk.overall_risk * 100).toFixed(0)}%</span></span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="uc-card p-4 text-center hover:border-white/10 transition-all">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: `${stat.color}10` }}>
              <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
            </div>
            <p className="text-lg font-bold text-white">{stat.value}</p>
            <p className="text-[11px] text-white/30 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Risk + UV */}
      {risk && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="uc-card p-6">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-5">Risk Assessment</h3>
            <div className="space-y-4">
              {[
                { label: 'Flood Risk', value: risk.flood_risk, color: '#3b82f6' },
                { label: 'UV Risk', value: risk.uv_risk, color: '#eab308' },
                { label: 'Wind Risk', value: risk.wind_risk, color: '#06b6d4' },
                { label: 'Overall Risk', value: risk.overall_risk, color: '#8b5cf6' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/40">{item.label}</span>
                    <span className="text-xs font-semibold text-white/70">{(item.value * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${item.value * 100}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }} className="h-full rounded-full" style={{ backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="uc-card p-6">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-5">UV Index</h3>
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-white">{weather.uv_index.toFixed(1)}</div>
              <p className={`text-base font-semibold mt-2 ${uvLevel.color}`}>{uvLevel.label}</p>
              <p className="text-xs text-white/30 mt-3 max-w-xs mx-auto">
                {weather.uv_index > 7 ? 'Avoid outdoor exposure. Wear sunscreen and protective clothing.' :
                 weather.uv_index > 5 ? 'Wear sunscreen. Seek shade during midday hours.' :
                 weather.uv_index > 2 ? 'Low risk. Enjoy outdoor activities.' : 'No protection needed.'}
              </p>
            </div>
            <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 via-orange-500 to-red-500 mt-4" />
            <div className="flex justify-between mt-1">
              {[0, 3, 6, 8, '11+'].map((v) => (
                <span key={String(v)} className="text-[10px] text-white/20">{v}</span>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
