import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Bell, Globe } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    notifications: true,
    emailAlerts: true,
    smsAlerts: false,
    autoAssign: true,
    riskThreshold: 70,
    weatherRefresh: 5,
    city: 'Vijayamangalam',
  })

  const toggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">System configuration and preferences</p>
        </div>
      </div>

      {/* Notifications */}
      <div className="uc-card p-6 space-y-1">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
            <Bell className="w-4.5 h-4.5 text-white" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Notifications</h3>
        </div>

        {[
          {
            key: 'notifications',
            label: 'Push Notifications',
            desc: 'Receive browser notifications for alerts',
          },
          {
            key: 'emailAlerts',
            label: 'Email Alerts',
            desc: 'Get email notifications for critical incidents',
          },
          { key: 'smsAlerts', label: 'SMS Alerts', desc: 'Receive SMS for emergency situations' },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-3.5 rounded-xl hover:bg-surface-2/40 transition-colors"
          >
            <div className="min-w-0 mr-4">
              <p className="text-sm font-medium text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            </div>
            <button
              onClick={() => toggle(item.key as keyof typeof settings)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                settings[item.key as keyof typeof settings] ? 'bg-accent-blue' : 'bg-surface-3'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  settings[item.key as keyof typeof settings] ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* General */}
      <div className="uc-card p-6 space-y-1">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center">
            <Globe className="w-4.5 h-4.5 text-white" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">General</h3>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-sm text-slate-500 mb-1.5 block">City</label>
            <input
              type="text"
              value={settings.city}
              onChange={(e) => setSettings({ ...settings, city: e.target.value })}
              className="uc-input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-500">Risk Alert Threshold</label>
              <span className="uc-chip bg-accent-blue/10 text-accent-blue font-mono">
                {settings.riskThreshold}%
              </span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="100"
                value={settings.riskThreshold}
                onChange={(e) => setSettings({ ...settings, riskThreshold: parseInt(e.target.value) })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-3
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:shadow-lg
                  [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-0
                  [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150
                  [&::-webkit-slider-thumb]:hover:scale-110"
              />
              <div
                className="absolute top-0 left-0 h-1.5 rounded-full bg-gradient-to-r from-accent-blue to-accent-cyan pointer-events-none"
                style={{ width: `${settings.riskThreshold}%` }}
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-500 mb-1.5 block">Weather Refresh Interval (minutes)</label>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.weatherRefresh}
              onChange={(e) => setSettings({ ...settings, weatherRefresh: parseInt(e.target.value) })}
              className="uc-input"
            />
          </div>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="uc-btn uc-btn-primary w-full py-3 text-sm font-semibold"
      >
        <Save className="w-4 h-4" />
        Save Settings
      </motion.button>
    </motion.div>
  )
}
