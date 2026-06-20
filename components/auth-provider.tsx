"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"

const role = process.env.ROLE || null;
type LoginPayload = {
  email?: string
  phone?: string
  password: string
}
export type User = {
  id:            string
  name:          string
  email:         string
  phone?:        string
  avatar?:       string
  role:          "customer"
  isVerified:    boolean
  phoneVerified: boolean
} | null

type AuthContextType = {
  user:               User
  isLoading:          boolean
  login:              (payload: LoginPayload) => Promise<void>
  register:           (name: string, email: string, password: string, phone: string, referralCode?: string) => Promise<void>
  logout:             () => void
  refreshAccessToken: () => Promise<boolean>
  getUserId:          () => string | null
  updateUser:         (updates: Partial<NonNullable<User>>) => void
  setNewUser:         (user: NonNullable<User>) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function buildUser(u: any): NonNullable<User> {
  return {
    id:            String(u.id),
    name:          u.full_name,
    email:         u.email,
    phone:         u.phone         ?? undefined,
    avatar:        u.profile_image ?? undefined,
    role:          u.role,
    isVerified:    u.email_verified  ?? false,
    phoneVerified: u.phone_verified  ?? false,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      // Optimistic: render header immediately with stored data
      try {
        const stored = localStorage.getItem("user")
        if (stored) setUser(JSON.parse(stored))
      } catch { /* corrupt JSON — ignore */ }

      // Authoritative: always verify with server and sync verification flags
      try {
        const res = await fetch(`/api/${role}/auth/me`, { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.user) {
            const serverUser = buildUser(data.data.user)
            setUser(serverUser)
            localStorage.setItem("user", JSON.stringify(serverUser))
          }
        } else {
          // Token invalid or expired
          localStorage.removeItem("user")
          setUser(null)
        }
      } catch { /* network error — keep optimistic state until next load */ }
      finally { setIsLoading(false) }
    }
    checkAuth()
  }, [])

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/${role}/auth/refresh-token`, { method: "POST", credentials: "include" })
      if (!res.ok) throw new Error("Refresh failed")
      return true
    } catch {
      setUser(null)
      localStorage.removeItem("user")
      return false
    }
  }, [])

  const login = async ({ email, phone, password }: LoginPayload) => {
    setIsLoading(true)
    try {
      const normalizedEmail = email?.trim().toLowerCase()
      const normalizedPhone = phone?.trim()
      if (!normalizedEmail && !normalizedPhone) {
        throw new Error("Email or phone is required")
      }
      const res = await fetch(`/api/${role}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || data.message || "Login failed")
      }
      if (data.data?.requiresVerification) {
        throw Object.assign(new Error('REQUIRES_VERIFICATION'), {
          requiresVerification: true,
          email: data.data.email,
          phone: data.data?.phone,
        })
      }
      if (!data.success || !data.data?.user) throw new Error("Invalid server response")
      const userData = buildUser(data.data.user)
      setUser(userData)
      localStorage.setItem("user", JSON.stringify(userData))
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (
    name: string,
    email: string,
    password: string,
    phone: string,
    referralCode?: string
  ) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/${role}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          full_name: name, email, password, phone,
          role: role,
          ...(referralCode ? { referral_code: referralCode } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || err.message || "Registration failed")
      }
      const data = await res.json()
      if (!data.success || !data.data?.user) throw new Error("Invalid server response")
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    try {
      await fetch(`/api/${role}/auth/logout`, { method: "POST", credentials: "include" })
    } catch { /* ignore */ }
    finally {
      setUser(null)
      localStorage.removeItem("user")
      setIsLoading(false)
    }
  }

  // Call after OTP success: updateUser({ isVerified: true, phoneVerified: true })
  // This immediately updates the header and all auth guards without a page reload.
  const updateUser = useCallback((updates: Partial<NonNullable<User>>) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      localStorage.setItem("user", JSON.stringify(updated))
      return updated
    })
  }, [])
  const setNewUser = useCallback((u: NonNullable<User>) => {
    setUser(u)
    localStorage.setItem("user", JSON.stringify(u))
    return u;
  }, [])

  const getUserId = useCallback((): string | null => user?.id ?? null, [user])

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout, refreshAccessToken, getUserId, updateUser, setNewUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}

export function useUserId(): string {
  const { user } = useAuth()
  if (!user?.id) throw new Error("User not authenticated")
  return user.id
}

export function useUserIdSafe(): string | null {
  const { user } = useAuth()
  return user?.id ?? null
}