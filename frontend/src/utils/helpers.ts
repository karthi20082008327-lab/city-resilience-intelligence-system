import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(date))
}

export function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    accident: 'text-red-400 bg-red-500/10',
    water_leak: 'text-blue-400 bg-blue-500/10',
    fire: 'text-orange-400 bg-orange-500/10',
    power_outage: 'text-yellow-400 bg-yellow-500/10',
    road_damage: 'text-gray-400 bg-gray-500/10',
    flood: 'text-cyan-400 bg-cyan-500/10',
    gas_leak: 'text-red-400 bg-red-500/10',
    building_collapse: 'text-red-400 bg-red-500/10',
    other: 'text-gray-400 bg-gray-500/10',
  }
  return colors[category] || colors.other
}

export function getPriorityColor(priority: string) {
  const colors: Record<string, string> = {
    critical: 'text-red-400 bg-red-500/10 border-red-500/30',
    high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    low: 'text-green-400 bg-green-500/10 border-green-500/30',
  }
  return colors[priority] || colors.medium
}

export function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    reported: 'text-blue-400 bg-blue-500/10',
    acknowledged: 'text-yellow-400 bg-yellow-500/10',
    in_progress: 'text-purple-400 bg-purple-500/10',
    resolved: 'text-green-400 bg-green-500/10',
    closed: 'text-gray-400 bg-gray-500/10',
  }
  return colors[status] || colors.reported
}

export function getCategoryIcon(category: string) {
  const icons: Record<string, string> = {
    accident: 'Car',
    water_leak: 'Droplets',
    fire: 'Flame',
    power_outage: 'Zap',
    road_damage: 'Construction',
    flood: 'CloudRain',
    gas_leak: 'AlertTriangle',
    building_collapse: 'Building',
    other: 'AlertCircle',
  }
  return icons[category] || icons.other
}

export function getDepartmentName(dept: string) {
  const names: Record<string, string> = {
    emergency_department: 'Emergency Dept',
    traffic_department: 'Traffic Dept',
    water_department: 'Water Dept',
    electricity_department: 'Electricity Dept',
    disaster_management: 'Disaster Mgmt',
  }
  return names[dept] || dept
}
