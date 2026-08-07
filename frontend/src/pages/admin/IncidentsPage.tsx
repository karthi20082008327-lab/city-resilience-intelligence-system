import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Filter, MapPin, Clock, User, X, Eye, Camera } from 'lucide-react'
import { incidentAPI } from '../../services/api'
import {
  formatDate,
  getPriorityColor,
  getStatusColor,
  getCategoryColor,
  getDepartmentName,
} from '../../utils/helpers'

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [selectedIncident, setSelectedIncident] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchIncidents = async () => {
      setLoading(true)
      try {
        const res = await incidentAPI.list({
          page,
          per_page: 15,
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
        })
        setIncidents(res.data.incidents)
        setTotal(res.data.total)
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    fetchIncidents()
  }, [page, categoryFilter, statusFilter, priorityFilter])

  const handleStatusUpdate = async (incidentId: string, newStatus: string) => {
    try {
      await incidentAPI.update(incidentId, { status: newStatus })
      setIncidents((prev) =>
        prev.map((inc) => (inc.incident_id === incidentId ? { ...inc, status: newStatus } : inc))
      )
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Incident Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} total incidents</p>
        </div>
      </div>

      {/* Filters */}
      <div className="uc-card px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Filters</span>
        </div>
        <div className="uc-divider-vertical h-5 w-px bg-slate-100" />
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value)
            setPage(1)
          }}
          className="uc-input w-auto text-xs py-1.5 px-3 bg-transparent"
        >
          <option value="">All Categories</option>
          <option value="accident">Accident</option>
          <option value="fire">Fire</option>
          <option value="flood">Flood</option>
          <option value="water_leak">Water Leak</option>
          <option value="power_outage">Power Outage</option>
          <option value="road_damage">Road Damage</option>
          <option value="gas_leak">Gas Leak</option>
          <option value="building_collapse">Building Collapse</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="uc-input w-auto text-xs py-1.5 px-3 bg-transparent"
        >
          <option value="">All Status</option>
          <option value="reported">Reported</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value)
            setPage(1)
          }}
          className="uc-input w-auto text-xs py-1.5 px-3 bg-transparent"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Table */}
      <div className="uc-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['ID', 'Category', 'Title', 'Priority', 'Status', 'Department', 'Time', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="uc-skeleton h-3.5 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No incidents found</p>
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        {inc.snapshot_url ? (
                          <button
                            onClick={() => setSelectedIncident(inc)}
                            className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/10 hover:ring-blue-500/40 transition-all group relative"
                          >
                            <img src={inc.snapshot_url} alt="" className="w-full h-full object-cover" />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3 h-3 text-white" />
                            </span>
                          </button>
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                            <Camera className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        )}
                        <span className="text-xs font-mono text-blue-600">{inc.incident_id}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`uc-chip ${getCategoryColor(inc.category)}`}>
                        {inc.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-slate-800">{inc.title}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`uc-chip border ${getPriorityColor(inc.priority)}`}>
                        {inc.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`uc-chip ${getStatusColor(inc.status)}`}>{inc.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-500">
                        {getDepartmentName(inc.assigned_department)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] text-slate-400">{formatDate(inc.created_at)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedIncident(inc)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        {inc.status !== 'resolved' && inc.status !== 'closed' && (
                          <select
                            value={inc.status}
                            onChange={(e) => handleStatusUpdate(inc.incident_id, e.target.value)}
                            className="text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none"
                          >
                            <option value="reported">Reported</option>
                            <option value="acknowledged">Acknowledge</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolve</option>
                            <option value="closed">Close</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            Showing {total === 0 ? 0 : (page - 1) * 15 + 1}–{Math.min(page * 15, total)} of {total}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="uc-btn uc-btn-ghost text-xs py-1.5 px-3 disabled:opacity-30"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page * 15 >= total}
              className="uc-btn uc-btn-ghost text-xs py-1.5 px-3 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedIncident && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedIncident(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="uc-card p-6 max-w-lg w-full uc-glow-border"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900">{selectedIncident.title}</h2>
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {selectedIncident.snapshot_url && (
                <div className="relative rounded-xl overflow-hidden mb-4 aspect-video bg-black/50">
                  <img
                    src={selectedIncident.snapshot_url}
                    alt="Incident snapshot"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                    <Camera className="w-3 h-3 text-red-400" />
                    <span className="text-[10px] text-white font-mono">CCTV SNAPSHOT</span>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400 w-20 flex-shrink-0">ID</span>
                  <span className="font-mono text-blue-600">{selectedIncident.incident_id}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400 w-20 flex-shrink-0">Category</span>
                  <span className={`uc-chip ${getCategoryColor(selectedIncident.category)}`}>
                    {selectedIncident.category.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400 w-20 flex-shrink-0">Priority</span>
                  <span className={`uc-chip border ${getPriorityColor(selectedIncident.priority)}`}>
                    {selectedIncident.priority}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400 w-20 flex-shrink-0">Status</span>
                  <span className={`uc-chip ${getStatusColor(selectedIncident.status)}`}>
                    {selectedIncident.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-600">{selectedIncident.location_address || 'No address'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-600">{formatDate(selectedIncident.created_at)}</span>
                </div>
                {selectedIncident.reporter_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{selectedIncident.reporter_name}</span>
                  </div>
                )}
                {selectedIncident.camera_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Camera className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{selectedIncident.camera_name}</span>
                  </div>
                )}
                {selectedIncident.description && (
                  <p className="text-sm text-slate-500 mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {selectedIncident.description}
                  </p>
                )}
                <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-700 font-medium">
                    AI Risk Score: {(selectedIncident.ai_risk_score * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Department: {getDepartmentName(selectedIncident.assigned_department)}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
