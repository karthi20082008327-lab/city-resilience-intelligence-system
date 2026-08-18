import axios from 'axios'
import type { AuthTokens, IncidentCreate, IncidentUpdate, User } from '../types'

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('cris-auth')
  if (stored) {
    const { state } = JSON.parse(stored)
    if (state?.accessToken) {
      config.headers.Authorization = `Bearer ${state.accessToken}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const stored = localStorage.getItem('cris-auth')
      if (stored) {
        const { state } = JSON.parse(stored)
        if (state?.refreshToken) {
          try {
            const res = await axios.post<AuthTokens>(`${API_BASE}/auth/refresh`, {
              refresh_token: state.refreshToken,
            })
            const { access_token, refresh_token, user } = res.data
            localStorage.setItem(
              'cris-auth',
              JSON.stringify({
                state: { ...state, accessToken: access_token, refreshToken: refresh_token, user },
              })
            )
            originalRequest.headers.Authorization = `Bearer ${access_token}`
            return api(originalRequest)
          } catch {
            localStorage.removeItem('cris-auth')
            window.location.href = '/admin/login'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (data: { email: string; password: string; remember_me?: boolean }) => api.post('/auth/login', data),
  departmentLogin: (data: { department: string; password: string }) => api.post('/auth/department-login', data),
  register: (data: {
    email: string
    username: string
    full_name: string
    password: string
    role_name?: string
  }) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, new_password: string) =>
    api.post('/auth/reset-password', { token, new_password }),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password', { current_password, new_password }),
  getMe: () => api.get('/auth/me'),
  getSessions: () => api.get('/auth/sessions'),
}

export const incidentAPI = {
  list: (params?: {
    page?: number
    per_page?: number
    category?: string
    status?: string
    priority?: string
    department?: string
  }) => api.get('/incidents/', { params }),
  get: (id: string) => api.get(`/incidents/${id}`),
  create: (data: IncidentCreate) => api.post('/incidents/', data),
  update: (id: string, data: IncidentUpdate) => api.put(`/incidents/${id}`, data),
  getStats: () => api.get('/incidents/stats'),
  uploadMedia: (incidentId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/incidents/${incidentId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const weatherAPI = {
  getCurrent: (city?: string) => api.get('/weather/', { params: { city } }),
  getRisk: (city?: string) => api.get('/weather/risk-assessment', { params: { city } }),
}

export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
}

export const userAPI = {
  list: (params?: { page?: number; per_page?: number }) => api.get('/users/', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: Partial<User>) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  getRoles: () => api.get('/users/roles/list'),
}

export const collisionAPI = {
  report: (formData: FormData) =>
    api.post('/collision/report', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

export default api
