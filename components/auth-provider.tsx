"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"

const role = process.env.ROLE || null;
// Silent access-token refresh is wired up for the customer build only —
// other roles (admin/laundry/delivery/support) keep the old behavior of
// just logging out on a real 401, no refresh attempt.
const isCustomer = role === "customer"
// How often to proactively rotate the access token while the customer app
// stays open in a tab, so a long-lived browsing session never hits a real
// expiry mid-use. Comfortably under ACCESS_TOKEN_EXPIRY (7d default).
const SILENT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
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
  role:          "customer" | "admin" | "delivery" | "laundry" | "support"
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

  // Plain (non-logout-on-failure) refresh attempt — used internally by
  // checkAuth's retry-after-401 and the periodic silent refresh below.
  // Returns whether the access token was successfully rotated.
  const tryRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/${role}/auth/refresh-token`, { method: "POST", credentials: "include" })
      return res.ok
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      // Optimistic: render header immediately with stored data
      try {
        const stored = localStorage.getItem("user")
        if (stored) setUser(JSON.parse(stored))
      } catch { /* corrupt JSON — ignore */ }

      // Authoritative: always verify with server and sync verification flags
      try {
        let res = await fetch(`/api/${role}/auth/me`, { credentials: "include" })

        // Customer-only: the access token may simply have expired while the
        // (still-valid) refresh token sat untouched — try a silent refresh
        // and re-check once before treating this as a real logout.
        if (!res.ok && (res.status === 401 || res.status === 403) && isCustomer) {
          const refreshed = await tryRefresh()
          if (refreshed) {
            res = await fetch(`/api/${role}/auth/me`, { credentials: "include" })
          }
        }

        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.user) {
            const serverUser = buildUser(data.data.user)
            setUser(serverUser)
            localStorage.setItem("user", JSON.stringify(serverUser))
          }
        } else if (res.status === 401 || res.status === 403) {
          // Genuinely unauthenticated — token invalid/expired/revoked
          // (and, for customers, the refresh attempt above didn't help either)
          localStorage.removeItem("user")
          setUser(null)
        }
        // Any other status (500, 502, 503, etc.) is a server/infra hiccup, not
        // proof the session is invalid — keep the optimistic state so a
        // transient DB/server error doesn't silently log the user out.
      } catch { /* network error — keep optimistic state until next load */ }
      finally { setIsLoading(false) }
    }
    checkAuth()
  }, [tryRefresh])

  // Customer-only: proactively rotate the access token on a fixed interval
  // while the user is logged in and the tab stays open, so a long browsing
  // session never runs into a real mid-use expiry. Other roles don't get
  // this — they keep the original "just re-check on next load" behavior.
  useEffect(() => {
    if (!isCustomer || !user) return
    const interval = setInterval(() => { tryRefresh() }, SILENT_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [user, tryRefresh])

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const ok = await tryRefresh()
    if (!ok) {
      setUser(null)
      localStorage.removeItem("user")
    }
    return ok
  }, [tryRefresh])

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