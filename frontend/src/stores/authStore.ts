import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  username: string
  full_name: string
  role: { id: string; name: string; description: string }
  department?: string
  avatar_url?: string
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  login: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      login: (user, accessToken, refreshToken) =>
        set({ isAuthenticated: true, user, accessToken, refreshToken }),
      logout: () => set({ isAuthenticated: false, user: null, accessToken: null, refreshToken: null }),
      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    { name: 'cris-auth' }
  )
)
