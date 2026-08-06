import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle, Clock,
  Building2, Droplets, Zap, Flame, Car, Shield,
  ArrowUp, ArrowDown
} from 'lucide-react'
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { dashboardAPI, incidentAPI } from '../../services/api'
import { useWebSocket } from '../../hooks/useWebSocket'
import { getPriorityColor, getStatusColor, getCategoryColor } from '../../utils/helpers'
import IncidentAlert from '../../components/IncidentAlert'

interface DashboardData {
  city_health_score: number
  risk_score: number
  total_incidents: number
  active_incidents: number
  resolved_today: number
  critical_incidents: number
  trend_data: { date: string; count: number }[]
  category_data: { category: string; count: number }[]
  priority_data: { priority: string; count: number }[]
  recent_incidents: any[]
  departments: Record<string, any>
  ai_insights: any[]
}

const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ef4444', '#22c55e', '#f59e0b']

function AnimatedCounter({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const end = value
    if (end === 0) { setCount(0); return }
    const step = Math.max(1, Math.ceil(end / (duration * 40)))
    const timer = setInterval(() => {
      start += step
      if (start >= end) { setCount(end); clearInterval(timer) }
      else setCount(start)
    }, 1000 / 40)
    return () => clearInterval(timer)
  }, [value, duration])
  return <span>{count}</span>
}

function GaugeRing({ value, size = 120, stroke = 8, color }: { value: number; size?: number; stroke?: number; color: string }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fill = (value / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${fill} ${circumference}` }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white"><AnimatedCounter value={value} /></span>
        <span className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">Score</span>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="uc-card p-5">
      <div className="uc-skeleton h-4 w-1/3 mb-3" />
      <div className="uc-skeleton h-8 w-1/2" />
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiAlert, setAiAlert] = useState<any>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashRes] = await Promise.all([dashboardAPI.getOverview()])
        setData(dashRes.data)
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  useWebSocket((msg) => {
    if (msg.type === 'incident') {
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          active_incidents: prev.active_incidents + (msg.action === 'created' ? 1 : 0),
          recent_incidents: [msg.data, ...prev.recent_incidents.slice(0, 9)],
        }
      })
      if (msg.action === 'created') setAiAlert(msg.data)
    }
  })

  const handleAcceptIncident = async (id: string) => {
    try { await incidentAPI.update(id, { status: 'acknowledged' }) } catch {}
  }
  const handleRejectIncident = async (id: string) => {
    try { await incidentAPI.update(id, { status: 'closed' }) } catch {}
  }
  const handleDispatchIncident = async (id: string) => {
    try { await incidentAPI.update(id, { status: 'in_progress' }) } catch {}
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (!data) return null

  const statCards = [
    { label: 'Total Incidents', value: data.total_incidents, icon: AlertTriangle, color: '#3b82f6', trend: '+12%', up: true },
    { label: 'Active Now', value: data.active_incidents, icon: Clock, color: '#f59e0b', trend: '-5%', up: false },
    { label: 'Resolved Today', value: data.resolved_today, icon: CheckCircle, color: '#22c55e', trend: '+18%', up: true },
    { label: 'Critical', value: data.critical_incidents, icon: Flame, color: '#ef4444', trend: '-2%', up: false },
  ]

  const deptIcons: Record<string, any> = {
    emergency_department: Flame, traffic_department: Car,
    water_department: Droplets, electricity_department: Zap, disaster_management: Shield,
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <IncidentAlert
        incident={aiAlert}
        onAccept={handleAcceptIncident}
        onReject={handleRejectIncident}
        onDispatch={handleDispatchIncident}
        onDismiss={() => setAiAlert(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Command Center</h1>
          <p className="text-white/35 text-sm mt-0.5">Real-time city monitoring overview</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/15">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Systems Operational</span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="uc-card p-5 group hover:border-white/10 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}12` }}>
                <stat.icon className="w-4.5 h-4.5" style={{ color: stat.color }} />
              </div>
              <span className={`text-[11px] font-medium flex items-center gap-0.5 ${stat.up ? 'text-emerald-400' : 'text-red-400'}`}>
                {stat.up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {stat.trend}
              </span>
            </div>
            <p className="text-2xl font-bold text-white"><AnimatedCounter value={stat.value} /></p>
            <p className="text-xs text-white/35 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* City Status */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="uc-card p-6">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-5">City Status</h3>
          <div className="flex items-center justify-around mb-5">
            <div className="text-center">
              <GaugeRing value={data.city_health_score} color="#22c55e" />
              <p className="text-[11px] text-white/30 mt-2">Health</p>
            </div>
            <div className="text-center">
              <GaugeRing value={data.risk_score} color="#ef4444" />
              <p className="text-[11px] text-white/30 mt-2">Risk</p>
            </div>
          </div>
          <div className="uc-divider mb-4" />
          <div className="space-y-2">
            {data.ai_insights.slice(0, 3).map((insight: any, i: number) => (
              <div key={i} className={`px-3 py-2 rounded-lg text-xs ${
                insight.severity === 'high' ? 'bg-red-500/[0.06] text-red-400' :
                insight.severity === 'medium' ? 'bg-amber-500/[0.06] text-amber-400' :
                'bg-emerald-500/[0.06] text-emerald-400'
              }`}>
                {insight.message}
              </div>
            ))}
            {data.ai_insights.length === 0 && (
              <p className="text-xs text-white/20 text-center py-2">No active insights</p>
            )}
          </div>
        </motion.div>

        {/* Trend Chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="uc-card p-6">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-5">7-Day Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.trend_data}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(10,15,26,0.95)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#fff',
                }}
              />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#trendGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Category Distribution */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="uc-card p-6">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-5">By Category</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.category_data} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={70} innerRadius={45} paddingAngle={3}>
                {data.category_data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(10,15,26,0.95)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#fff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
            {data.category_data.map((item, i) => (
              <span key={i} className="text-[11px] text-white/40 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {item.category.replace('_', ' ')}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Departments */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="uc-card p-6">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Department Status</h3>
          <div className="space-y-2.5">
            {Object.entries(data.departments).map(([dept, info]: [string, any]) => {
              const Icon = deptIcons[dept] || Building2
              return (
                <div key={dept} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/[0.08] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-blue-400/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 capitalize truncate">{dept.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-white/30">{info.active} active · {info.resolved} resolved</p>
                  </div>
                  <span className={`uc-chip ${
                    info.status === 'operational' ? 'bg-emerald-500/[0.08] text-emerald-400' :
                    info.status === 'stressed' ? 'bg-amber-500/[0.08] text-amber-400' :
                    'bg-red-500/[0.08] text-red-400'
                  }`}>
                    {info.status}
                  </span>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* Recent Incidents */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="uc-card p-6">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Recent Incidents</h3>
          <div className="space-y-2">
            {data.recent_incidents.slice(0, 6).map((inc: any) => (
              <div key={inc.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getCategoryColor(inc.category)}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">{inc.title}</p>
                  <p className="text-[11px] text-white/30 font-mono">{inc.incident_id}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`uc-chip ${getPriorityColor(inc.priority)}`}>{inc.priority}</span>
                  <span className={`uc-chip ${getStatusColor(inc.status)}`}>{inc.status}</span>
                </div>
              </div>
            ))}
            {data.recent_incidents.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-sm text-white/25">No recent incidents</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
