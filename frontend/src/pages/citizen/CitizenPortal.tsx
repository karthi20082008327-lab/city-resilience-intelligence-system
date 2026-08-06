import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, AlertTriangle, Droplets, Flame, Zap, Construction,
  MapPin, Camera, Phone, Send, CheckCircle, ArrowLeft, Navigation,
  X, Upload, Clock, Radio, ChevronRight, Home
} from 'lucide-react'
import { incidentAPI } from '../../services/api'
import { UcripLogo } from '../../components/UcripLogo'

const reportCategories = [
  { id: 'accident', label: 'Accident', icon: AlertTriangle, color: 'from-red-500 to-orange-500', desc: 'Road accident or collision' },
  { id: 'water_leak', label: 'Water Leak', icon: Droplets, color: 'from-blue-500 to-cyan-500', desc: 'Burst pipe or water leak' },
  { id: 'fire', label: 'Fire', icon: Flame, color: 'from-orange-500 to-red-500', desc: 'Fire emergency' },
  { id: 'power_outage', label: 'Power Failure', icon: Zap, color: 'from-yellow-500 to-amber-500', desc: 'Electrical outage or fault' },
  { id: 'road_damage', label: 'Road Damage', icon: Construction, color: 'from-gray-400 to-gray-500', desc: 'Pothole or road damage' },
]

interface LocationState {
  latitude: number | null
  longitude: number | null
  address: string
}

export default function CitizenPortal() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'select' | 'report' | 'success'>('select')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState<LocationState>({ latitude: null, longitude: null, address: '' })
  const [gettingLocation, setGettingLocation] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reporter_name: '',
    reporter_phone: '',
  })
  const [submittedId, setSubmittedId] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const getLocation = () => {
    setGettingLocation(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            address: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          })
          setGettingLocation(false)
        },
        () => {
          setLocation({ latitude: 11.3128, longitude: 77.4909, address: 'Vijayamangalam (Default)' })
          setGettingLocation(false)
        }
      )
    } else {
      setLocation({ latitude: 11.3128, longitude: 77.4909, address: 'Vijayamangalam (Default)' })
      setGettingLocation(false)
    }
  }

  useEffect(() => { getLocation() }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async () => {
    if (!formData.title || !selectedCategory) return
    setLoading(true)

    try {
      const res = await incidentAPI.create({
        category: selectedCategory,
        title: formData.title,
        description: formData.description,
        latitude: location.latitude,
        longitude: location.longitude,
        location_address: location.address,
        reporter_name: formData.reporter_name || 'Anonymous Citizen',
        reporter_phone: formData.reporter_phone,
      })

      if (imageFile && res.data.incident_id) {
        try {
          await incidentAPI.uploadMedia(res.data.incident_id, imageFile)
        } catch {}
      }

      setSubmittedId(res.data.incident_id)
      setStep('success')
    } catch (e) {
      console.error(e)
      alert('Failed to submit report. Please try again.')
    }
    setLoading(false)
  }

  const selectedCat = reportCategories.find((c) => c.id === selectedCategory)

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Header */}
      <header className="sticky top-0 z-30 uc-glass-strong border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => (step === 'select' ? navigate('/') : setStep('select'))}
            className="w-9 h-9 rounded-xl bg-surface-2/60 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-3/60 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <UcripLogo className="w-8 h-8" />
            <span className="font-bold uc-gradient-text text-sm">UCRIP</span>
          </div>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Step Indicator */}
        {step !== 'success' && (
          <div className="flex items-center gap-2 mb-8 px-1">
            {['select', 'report'].map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    (step === 'select' && i === 0) || (step === 'report' && i <= 1)
                      ? 'bg-accent-blue'
                      : 'bg-surface-3'
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 1: Category Selection */}
          {step === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">Report an Incident</h1>
                <p className="text-sm text-gray-400">Select the type of incident you want to report</p>
              </div>

              <div className="space-y-3">
                {reportCategories.map((cat, i) => (
                  <motion.button
                    key={cat.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    whileHover={{ scale: 1.01, x: 4 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { setSelectedCategory(cat.id); setStep('report') }}
                    className="w-full uc-card uc-card-hover p-4 flex items-center gap-4 text-left"
                  >
                    <div className={`w-13 h-13 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      <cat.icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-white">{cat.label}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{cat.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  </motion.button>
                ))}
              </div>

              {/* Emergency Banner */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-8 uc-card p-4 border-state-danger/20 bg-state-danger/5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-state-danger/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-state-danger" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Emergency? Call 112</p>
                    <p className="text-xs text-gray-400">For immediate life-threatening emergencies</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Step 2: Report Form */}
          {step === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              {/* Selected Category Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${selectedCat?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center shadow-lg`}>
                  {selectedCat && <selectedCat.icon className="w-5 h-5 text-white" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedCat?.label}</h2>
                  <p className="text-xs text-gray-400">Fill in the details below</p>
                </div>
              </div>

              {/* Title */}
              <div className="uc-card p-4 space-y-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Incident Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="uc-input"
                    placeholder="Brief description of the incident"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="uc-input min-h-[100px] resize-none"
                    placeholder="Provide more details about what you observed..."
                  />
                </div>
              </div>

              {/* Location */}
              <div className="uc-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent-blue" />
                    <span className="text-sm font-medium text-white">Location</span>
                  </div>
                  <button
                    onClick={getLocation}
                    disabled={gettingLocation}
                    className="uc-chip bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors"
                  >
                    <Navigation className={`w-3 h-3 mr-1 ${gettingLocation ? 'animate-spin' : ''}`} />
                    {gettingLocation ? 'Getting...' : 'Update'}
                  </button>
                </div>
                {location.latitude ? (
                  <div className="p-3 rounded-xl bg-surface-2/40">
                    <p className="text-sm text-gray-200">{location.address}</p>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      {location.latitude.toFixed(4)}, {location.longitude?.toFixed(4)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 py-2">Tap Update to get your current location</p>
                )}
              </div>

              {/* Image Upload */}
              <div className="uc-card p-4">
                <label className="text-sm text-gray-400 mb-2.5 block">Photo Evidence</label>
                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={imagePreview} alt="Upload" className="w-full h-48 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null) }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                    <p className="absolute bottom-2 left-3 text-xs text-white/80">{imageFile?.name}</p>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2.5 p-8 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-accent-blue/30 hover:bg-surface-2/20 transition-all">
                    <div className="w-12 h-12 rounded-2xl bg-surface-3/60 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="text-center">
                      <span className="text-sm text-gray-400">Tap to upload photo</span>
                      <p className="text-[10px] text-gray-600 mt-0.5">JPG, PNG up to 10MB</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                  </label>
                )}
              </div>

              {/* Contact Info */}
              <div className="uc-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-white">Contact Information</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Your Name</label>
                    <input
                      type="text"
                      value={formData.reporter_name}
                      onChange={(e) => setFormData({ ...formData, reporter_name: e.target.value })}
                      className="uc-input"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.reporter_phone}
                      onChange={(e) => setFormData({ ...formData, reporter_phone: e.target.value })}
                      className="uc-input"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleSubmit}
                disabled={!formData.title || loading}
                className="w-full uc-btn uc-btn-primary py-4 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4.5 h-4.5" />
                    Submit Report
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="text-center py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-20 h-20 rounded-3xl bg-state-success/15 flex items-center justify-center mx-auto mb-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
                >
                  <CheckCircle className="w-10 h-10 text-state-success" />
                </motion.div>
              </motion.div>

              <h2 className="text-2xl font-bold text-white mb-2">Report Submitted!</h2>
              <p className="text-sm text-gray-400 mb-8">Your incident has been reported successfully</p>

              <div className="uc-card p-6 max-w-sm mx-auto mb-8">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Your Incident ID</p>
                <p className="text-2xl font-bold font-mono uc-gradient-text">{submittedId}</p>
                <p className="text-[10px] text-gray-500 mt-2">Save this ID for tracking</p>
              </div>

              <div className="space-y-3 max-w-sm mx-auto">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    setStep('select')
                    setFormData({ title: '', description: '', reporter_name: '', reporter_phone: '' })
                    setImageFile(null)
                    setImagePreview(null)
                  }}
                  className="w-full uc-btn uc-btn-primary py-3 text-sm font-semibold"
                >
                  Report Another Incident
                </motion.button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full uc-btn uc-btn-ghost py-3 text-sm"
                >
                  <Home className="w-4 h-4" />
                  Back to Home
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
