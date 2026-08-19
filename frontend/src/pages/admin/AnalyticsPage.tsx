import { motion } from 'framer-motion'
import { BarChart3, PieChart as PieIcon, Clock, Target, Gauge, Activity } from 'lucide-react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

const monthlyData = [
  { month: 'Jan', incidents: 45, resolved: 40 },
  { month: 'Feb', incidents: 52, resolved: 48 },
  { month: 'Mar', incidents: 61, resolved: 55 },
  { month: 'Apr', incidents: 48, resolved: 45 },
  { month: 'May', incidents: 72, resolved: 65 },
  { month: 'Jun', incidents: 85, resolved: 78 },
  { month: 'Jul', incidents: 92, resolved: 85 },
  { month: 'Aug', incidents: 78, resolved: 72 },
]

const categoryStats = [
  { name: 'Accidents', value: 156, color: '#EF4444' },
  { name: 'Fires', value: 45, color: '#F97316' },
  { name: 'Floods', value: 32, color: '#3B82F6' },
  { name: 'Power Issues', value: 89, color: '#EAB308' },
  { name: 'Water Leaks', value: 67, color: '#06B6D4' },
  { name: 'Road Damage', value: 43, color: '#6B7280' },
]

const performanceData = [
  {
    metric: 'Avg Response Time',
    value: '12 min',
    change: '-15%',
    icon: Clock,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    metric: 'Resolution Rate',
    value: '94%',
    change: '+8%',
    icon: Target,
    color: 'from-blue-500 to-indigo-500',
  },
  {
    metric: 'Avg Risk Score',
    value: '0.42',
    change: '-5%',
    icon: Gauge,
    color: 'from-purple-500 to-pink-500',
  },
  {
    metric: 'Active Sensors',
    value: '847',
    change: '+12%',
    icon: Activity,
    color: 'from-amber-500 to-orange-500',
  },
]

export default function AnalyticsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-slate-500 text-sm mt-1">
            Comprehensive incident analytics and performance metrics
          </p>
        </div>
        <div className="uc-chip bg-accent-blue/10 text-accent-blue">
          <BarChart3 className="w-3.5 h-3.5 mr-1" />
          Live Data
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {performanceData.map((metric, i) => (
          <motion.div
            key={metric.metric}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="uc-card uc-card-hover p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center`}
              >
                <metric.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <span
                className={`text-xs font-medium ${metric.change.startsWith('+') ? 'text-state-success' : 'text-state-danger'}`}
              >
                {metric.change}
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{metric.value}</p>
            <p className="text-xs text-slate-500 mt-1.5">{metric.metric}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="uc-card p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4.5 h-4.5 text-accent-blue" />
            <h3 className="text-base font-semibold text-slate-900">Monthly Incident Trend</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" stroke="#6b7280" fontSize={12} axisLine={false} tickLine={false} />
              <YAxis stroke="#6b7280" fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                }}
              />
              <Bar dataKey="incidents" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Incidents" />
              <Bar dataKey="resolved" fill="#22c55e" radius={[6, 6, 0, 0]} name="Resolved" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="uc-card p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <PieIcon className="w-4.5 h-4.5 text-accent-purple" />
            <h3 className="text-base font-semibold text-slate-900">Incidents by Category</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={categoryStats}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={85}
                innerRadius={50}
                paddingAngle={3}
                stroke="none"
              >
                {categoryStats.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {categoryStats.map((cat) => (
              <div key={cat.name} className="flex items-center gap-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-xs text-slate-500 truncate">
                  {cat.name}: <span className="text-slate-900 font-medium">{cat.value}</span>
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
