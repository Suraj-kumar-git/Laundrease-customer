"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

const role = process.env.ROLE || null;
// Silent access-token refresh needs a working `/api/{role}/auth/refresh-token`
// endpoint + a refresh_token cookie actually being issued at login — true for
// customer, laundry, and delivery. admin/support have neither today, so they
// keep the old behavior of just logging out on a real 401, no refresh attempt.
const supportsSilentRefresh = role === "customer" || role === "laundry" || role === "delivery"
// How often to proactively rotate the access token while the app stays open
// in a tab, so a long-lived session never hits a real expiry mid-use.
// Comfortably under ACCESS_TOKEN_EXPIRY (7d default).
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
  // Call this from any page-level fetch that gets back a real 401/403 —
  // immediately syncs the header + localStorage to "logged out" instead of
  // waiting for the next periodic checkAuth pass. Keeps cookie state and
  // cached user data from drifting apart (e.g. if cookies were cleared by
  // something other than the in-app logout() call).
  markUnauthorized:   () => void
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
  const pathname = usePathname()
  const hasCheckedOnce = useRef(false)

  // The refresh-token endpoint rotates the refresh token on every call and
  // treats any mismatch as token theft, wiping ALL of the user's sessions
  // (see app/api/customer/auth/refresh-token/route.ts). checkAuth() re-runs
  // on every pathname change AND a separate interval below also calls
  // tryRefresh() — without this dedup, two refresh calls firing close
  // together (fast navigation, the interval landing mid-navigation, etc.)
  // would race: the first rotates the token, the second still holds the
  // now-stale token and gets treated as theft, force-logging the user out
  // for no real reason. Sharing a single in-flight promise guarantees only
  // one actual POST to /refresh-token is ever in flight at a time.
  const refreshInFlight = useRef<Promise<boolean> | null>(null)

  // Plain (non-logout-on-failure) refresh attempt — used internally by
  // checkAuth's retry-after-401 and the periodic silent refresh below.
  // Returns whether the access token was successfully rotated.
  const tryRefresh = useCallback(async (): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current

    const promise = (async () => {
      try {
        const res = await fetch(`/api/${role}/auth/refresh-token`, { method: "POST", credentials: "include" })
        return res.ok
      } catch {
        return false
      } finally {
        refreshInFlight.current = null
      }
    })()

    refreshInFlight.current = promise
    return promise
  }, [])

  // Immediately syncs the header + localStorage to "logged out". Any
  // page-level fetch that gets back a real 401/403 should call this via
  // markUnauthorized() below, instead of waiting for the next checkAuth
  // pass — otherwise the header keeps showing a stale "logged in" state
  // (read optimistically from localStorage) even though the cookies are
  // already gone, and clicking any nav item bounces to login with no
  // visible explanation.
  const clearAuthState = useCallback(() => {
    localStorage.removeItem("user")
    // Also drop the cart-provider's "already synced this guest cart" marker —
    // otherwise a different user logging in on this browser (or this user
    // logging back in as a genuine guest later) would be treated as already
    // synced and their pending local cart would never get pushed to the server.
    localStorage.removeItem("laundrease_cart_synced_user_v1")
    setUser(null)
  }, [])

  const checkAuth = useCallback(async () => {
    // Optimistic: render header immediately with stored data (first run only)
    if (!hasCheckedOnce.current) {
      try {
        const stored = localStorage.getItem("user")
        if (stored) setUser(JSON.parse(stored))
      } catch { /* corrupt JSON — ignore */ }
    }

    // Authoritative: always verify with server and sync verification flags
    try {
      let res = await fetch(`/api/${role}/auth/me`, { credentials: "include" })

      // The access token may simply have expired while the (still-valid)
      // refresh token sat untouched — try a silent refresh and re-check
      // once before treating this as a real logout.
      if (!res.ok && (res.status === 401 || res.status === 403) && supportsSilentRefresh) {
        const refreshed = await tryRefresh()
        if (refreshed) {
          res = await fetch(`/api/${role}/auth/me`, { credentials: "include" })
        }
      }

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.user) {
          const serverUser = buildUser(data.data.user)
          // checkAuth reruns on every client-side navigation (see the
          // pathname effect below). Re-using the previous object when
          // nothing actually changed keeps `user`'s reference stable across
          // page transitions — otherwise every nav creates a "new" user
          // object, which retriggers any effect keyed on `user` elsewhere in
          // the app (e.g. the order-create page's cart check), causing a
          // visible flash of re-fetched/re-rendered content on every page.
          setUser(prev => (prev && JSON.stringify(prev) === JSON.stringify(serverUser)) ? prev : serverUser)
          localStorage.setItem("user", JSON.stringify(serverUser))
        }
      } else if (res.status === 401 || res.status === 403) {
        // Genuinely unauthenticated — token invalid/expired/revoked
        // (and, where supported, the refresh attempt above didn't help either)
        clearAuthState()
      }
      // Any other status (500, 502, 503, etc.) is a server/infra hiccup, not
      // proof the session is invalid — keep the optimistic state so a
      // transient DB/server error doesn't silently log the user out.
    } catch { /* network error — keep optimistic state until next load */ }
    finally { setIsLoading(false); hasCheckedOnce.current = true }
  }, [tryRefresh, clearAuthState])

  // Re-validate on every route change, not just on first load — the header
  // is mounted once in the root layout and otherwise never notices if the
  // session went bad (cookies expired/revoked/cleared) while the user kept
  // navigating client-side, leaving it stuck showing a stale "logged in"
  // state until a full page reload.
  useEffect(() => { checkAuth() }, [pathname, checkAuth])

  // Proactively rotate the access token on a fixed interval while the user
  // is logged in and the tab stays open, so a long browsing/working session
  // never runs into a real mid-use expiry. Roles without a refresh endpoint
  // (admin/support) don't get this — they keep the original "just re-check
  // on next load" behavior.
  useEffect(() => {
    if (!supportsSilentRefresh || !user) return
    const interval = setInterval(() => { tryRefresh() }, SILENT_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [user, tryRefresh])

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const ok = await tryRefresh()
    if (!ok) clearAuthState()
    return ok
  }, [tryRefresh, clearAuthState])

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
      clearAuthState()
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
      value={{ user, isLoading, login, register, logout, refreshAccessToken, getUserId, updateUser, setNewUser, markUnauthorized: clearAuthState }}
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