import { motion } from 'framer-motion'
import { Brain, TrendingUp } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const predictionData = [
  { time: '00:00', flood: 12, fire: 8, accident: 15 },
  { time: '04:00', flood: 15, fire: 10, accident: 12 },
  { time: '08:00', flood: 20, fire: 12, accident: 25 },
  { time: '12:00', flood: 35, fire: 18, accident: 30 },
  { time: '16:00', flood: 45, fire: 15, accident: 35 },
  { time: '20:00', flood: 30, fire: 12, accident: 20 },
]

const riskFactors = [
  { name: 'Heavy Rainfall', probability: 78, impact: 'High', color: '#3b82f6' },
  { name: 'Traffic Congestion', probability: 65, impact: 'Medium', color: '#eab308' },
  { name: 'Power Grid Stress', probability: 42, impact: 'High', color: '#8b5cf6' },
  { name: 'Water Pipeline Risk', probability: 35, impact: 'Medium', color: '#6366f1' },
  { name: 'Flood Cascade Risk', probability: 58, impact: 'Critical', color: '#ef4444' },
  { name: 'Fire Spread Risk', probability: 25, impact: 'Low', color: '#22c55e' },
]

const cascadingPaths = [
  { from: 'Heavy Rain', to: 'Flooding', risk: 0.85, dept: 'Disaster Management' },
  { from: 'Flooding', to: 'Power Outage', risk: 0.72, dept: 'Electricity Dept' },
  { from: 'Power Outage', to: 'Traffic Lights Down', risk: 0.65, dept: 'Traffic Dept' },
  { from: 'Traffic Lights Down', to: 'Accidents', risk: 0.58, dept: 'Emergency Dept' },
  { from: 'Heavy Rain', to: 'Water Pipeline Burst', risk: 0.45, dept: 'Water Dept' },
]

export default function AIPredictionPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">AI Risk Prediction</h1>
          <p className="text-slate-500 text-sm mt-0.5">Machine learning powered cascading risk analysis</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200">
          <Brain className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs text-purple-600 font-medium">XGBoost + NetworkX</span>
        </div>
      </div>

      {/* Forecast Chart */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="uc-card p-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">
          24-Hour Risk Forecast
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={predictionData}>
            <defs>
              <linearGradient id="flood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fire" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="accident" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#eab308" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis
              dataKey="time"
              stroke="rgba(255,255,255,0.2)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,15,26,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#475569',
              }}
            />
            <Area
              type="monotone"
              dataKey="flood"
              stroke="#3b82f6"
              fill="url(#flood)"
              strokeWidth={2}
              name="Flood"
            />
            <Area
              type="monotone"
              dataKey="fire"
              stroke="#ef4444"
              fill="url(#fire)"
              strokeWidth={2}
              name="Fire"
            />
            <Area
              type="monotone"
              dataKey="accident"
              stroke="#eab308"
              fill="url(#accident)"
              strokeWidth={2}
              name="Accident"
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Risk Factors */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="uc-card p-6"
        >
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">
            Active Risk Factors
          </h3>
          <div className="space-y-3">
            {riskFactors.map((factor, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm text-slate-800">{factor.name}</span>
                  <span
                    className={`uc-chip ${
                      factor.impact === 'Critical'
                        ? 'bg-red-50 text-red-700'
                        : factor.impact === 'High'
                          ? 'bg-amber-50 text-amber-700'
                          : factor.impact === 'Medium'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {factor.impact}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${factor.probability}%` }}
                      transition={{ duration: 1, delay: i * 0.08 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: factor.color }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-10 text-right font-mono">
                    {factor.probability}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Cascade Paths */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="uc-card p-6"
        >
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">
            Cascade Propagation Paths
          </h3>
          <div className="space-y-2.5">
            {cascadingPaths.map((path, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-800 font-medium">{path.from}</span>
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600/60 rotate-90 flex-shrink-0" />
                  <span className="text-slate-800 font-medium">{path.to}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-slate-400">{path.dept}</span>
                  <span
                    className={`text-xs font-semibold font-mono ${path.risk > 0.7 ? 'text-red-600' : path.risk > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}
                  >
                    {(path.risk * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
