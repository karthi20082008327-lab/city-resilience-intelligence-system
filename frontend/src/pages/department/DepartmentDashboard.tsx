import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Building2,
  ArrowRight,
  MapPin,
} from 'lucide-react'
import { incidentAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import {
  formatDate,
  getPriorityColor,
  getStatusColor,
  getCategoryColor,
  getDepartmentName,
} from '../../utils/helpers'

export default function DepartmentDashboard() {
  const { user } = useAuthStore()
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  const userDepartment = user?.role?.name || ''
  const departmentName = getDepartmentName(userDepartment)

  useEffect(() => {
    const fetchIncidents = async () => {
      setLoading(true)
      try {
        const res = await incidentAPI.list({ page: 1, per_page: 50, department: userDepartment })
        setIncidents(res.data.incidents)
        setTotal(res.data.total)
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    fetchIncidents()
  }, [userDepartment])

  const activeIncidents = incidents.filter(
    (i) => i.status === 'reported' || i.status === 'acknowledged' || i.status === 'in_progress'
  )
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved' || i.status === 'closed')
  const criticalIncidents = incidents.filter((i) => i.priority === 'critical' || i.priority === 'high')

  const stats = [
    { label: 'Total Assigned', value: total, icon: Building2, color: 'from-blue-500 to-indigo-500', accent: 'text-blue-600 bg-blue-500/10' },
    { label: 'Active', value: activeIncidents.length, icon: Loader2, color: 'from-orange-500 to-amber-500', accent: 'text-orange-600 bg-orange-500/10' },
    { label: 'Resolved', value: resolvedIncidents.length, icon: CheckCircle2, color: 'from-emerald-500 to-green-500', accent: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Critical / High', value: criticalIncidents.length, icon: AlertTriangle, color: 'from-red-500 to-rose-500', accent: 'text-red-600 bg-red-500/10' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{departmentName} Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Incidents assigned to your department
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Building2 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">{departmentName}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="uc-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${stat.accent}`}>
                {stat.label}
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900 leading-none">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent Incidents */}
      <div className="uc-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Assigned Incidents</h2>
            <p className="text-xs text-slate-500 mt-0.5">Latest incidents routed to {departmentName}</p>
          </div>
          <a
            href="#/department/incidents"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['ID', 'Category', 'Title', 'Priority', 'Status', 'Time', 'Location'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="uc-skeleton h-3.5 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400 font-medium">No incidents assigned yet</p>
                    <p className="text-xs text-slate-400 mt-1">Incidents matching your department will appear here</p>
                  </td>
                </tr>
              ) : (
                incidents.slice(0, 8).map((inc) => (
                  <tr key={inc.id} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono text-blue-600">{inc.incident_id}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`uc-chip ${getCategoryColor(inc.category)}`}>
                        {inc.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-slate-800">{inc.title}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`uc-chip border ${getPriorityColor(inc.priority)}`}>{inc.priority}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`uc-chip ${getStatusColor(inc.status)}`}>{inc.status}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] text-slate-400">{formatDate(inc.created_at)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {inc.location_address || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
