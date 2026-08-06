import { motion } from 'framer-motion'
import { Flame, Car, Droplets, Zap, Shield, Users, AlertTriangle, CheckCircle } from 'lucide-react'

const departments = [
  {
    name: 'Emergency Department',
    icon: Flame,
    color: 'from-red-500 to-orange-500',
    head: 'Dr. Rajesh Kumar',
    staff: 145,
    activeIncidents: 12,
    resolvedToday: 8,
  },
  {
    name: 'Traffic Department',
    icon: Car,
    color: 'from-yellow-500 to-amber-500',
    head: 'Sgt. Priya Sharma',
    staff: 230,
    activeIncidents: 18,
    resolvedToday: 15,
  },
  {
    name: 'Water Department',
    icon: Droplets,
    color: 'from-blue-500 to-cyan-500',
    head: 'Eng. Amit Patel',
    staff: 95,
    activeIncidents: 5,
    resolvedToday: 3,
  },
  {
    name: 'Electricity Department',
    icon: Zap,
    color: 'from-purple-500 to-pink-500',
    head: 'Eng. Sneha Reddy',
    staff: 120,
    activeIncidents: 7,
    resolvedToday: 6,
  },
  {
    name: 'Disaster Management',
    icon: Shield,
    color: 'from-teal-500 to-green-500',
    head: 'Cmdr. Vikram Singh',
    staff: 85,
    activeIncidents: 3,
    resolvedToday: 2,
  },
]

export default function DepartmentsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Department Management</h1>
          <p className="text-sm text-gray-400 mt-1">All city departments overview and performance</p>
        </div>
        <div className="uc-chip bg-accent-blue/10 text-accent-blue">{departments.length} Departments</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {departments.map((dept, i) => {
          const loadPct = Math.min((dept.activeIncidents / dept.staff) * 100 * 5, 100)
          return (
            <motion.div
              key={dept.name}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="uc-card uc-card-hover p-6 group"
            >
              <div className="flex items-center gap-4 mb-5">
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${dept.color} flex items-center justify-center shadow-lg flex-shrink-0`}
                >
                  <dept.icon className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{dept.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{dept.head}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="text-center p-3 rounded-xl bg-surface-2/60">
                  <Users className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
                  <p className="text-lg font-bold text-white leading-none">{dept.staff}</p>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Staff</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-surface-2/60">
                  <AlertTriangle className="w-4 h-4 text-state-warning mx-auto mb-1.5" />
                  <p className="text-lg font-bold text-white leading-none">{dept.activeIncidents}</p>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Active</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-surface-2/60">
                  <CheckCircle className="w-4 h-4 text-state-success mx-auto mb-1.5" />
                  <p className="text-lg font-bold text-white leading-none">{dept.resolvedToday}</p>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Resolved</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                  <span>Load</span>
                  <span className="font-medium text-white">{Math.round(loadPct)}%</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${loadPct}%` }}
                    transition={{ duration: 1, delay: i * 0.1 + 0.3, ease: 'easeOut' }}
                    className={`h-full rounded-full bg-gradient-to-r ${dept.color}`}
                  />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
