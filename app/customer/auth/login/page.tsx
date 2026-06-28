"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Mail, Lock, Loader2, ShoppingBag, AlertCircle, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { SearchParamProvider } from "@/components/common/searchParamProvider"

function validate(loginWithEmail: boolean, email: string, phone: string, password: string
): Record<string, string> {
  const e: Record<string, string> = {}
  if (loginWithEmail) {
    if (!email.trim()) {
      e.email = "Email is required"
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      e.email = "Enter a valid email address"
    }
  } else {
    const digits = phone.replace(/\D/g, "")
    if (!phone.trim()) {
      e.phone = "Phone number is required"
    } else if (digits.length < 10 || digits.length > 15) {
      e.phone = "Enter a valid phone number"
    }
  }
  if (!password) {
    e.password = "Password is required"
  } else if (password.length < 8) {
    e.password = "Password must be at least 8 characters"
  }
  return e
}

function PageContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { login, user, isLoading: authLoading } = useAuth()
  const { toast } = useToast()

  const returnTo = searchParams.get("returnTo") || "/customer/dashboard"
  const [loginWithEmail, setLoginWithEmail] = useState(false)
  const [email,       setEmail]       = useState("")
  const [phone,       setPhone]       = useState("")
  const [password,    setPassword]    = useState("")
  const [showPwd,     setShowPwd]     = useState(false)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [submitting,  setSubmitting]  = useState(false)
  const [serverError, setServerError] = useState("")

  // Already logged in — redirect
  useEffect(() => {
    if (!authLoading && user?.isVerified && user?.phoneVerified) {
      router.replace(returnTo)
    }
  }, [user, authLoading, returnTo, router])

  const clearError = (field: string) =>
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError("")
    const errs = validate(loginWithEmail, email, phone, password)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSubmitting(true)
    try {
      await login(
        loginWithEmail
          ? { email: email.trim().toLowerCase(), password }
          : { phone: phone.trim(), password }
      )
      // Hard navigation, not router.replace: the Next.js Router Cache can
      // hold onto a stale "redirect to login" result for this path from
      // before the user was authenticated, which would bounce them right
      // back here even though the cookie was just set successfully. A full
      // navigation always re-evaluates middleware against the fresh cookie.
      window.location.href = returnTo
    } catch (err: any) {
      if(err.requiresVerification) {
        router.push(`/customer/auth/verify?email=${encodeURIComponent(err.email)}&phone=${encodeURIComponent(err.phone)}`)
        return;
      }
      const msg = err.message || "Login failed"
      setServerError(msg)
      setPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // Full-screen: single column on mobile, two columns on md+
    <div className="flex min-h-screen">
      <div className="w-full max-w-md md:w-1/2 mx-auto bg-background px-6 py-12 sm:px-10">
        <div className="w-full">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Sign In</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter your credentials to continue</p>
          </div>

          {/* Server error banner */}
          {serverError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Phone / Email */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={loginWithEmail ? "email" : "phone"}>
                  {loginWithEmail ? "Email" : "Phone"}
                </Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setLoginWithEmail(v => !v)
                    setServerError("")
                    setErrors({})
                  }}
                >
                  {loginWithEmail ? "Use phone instead" : "Use email instead"}
                </button>
              </div>
              <div className="relative">
                {loginWithEmail ? (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                ) : (
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                )}
                <Input
                  id={loginWithEmail ? "email" : "phone"}
                  type={loginWithEmail ? "email" : "tel"}
                  autoComplete={loginWithEmail ? "email" : "tel"}
                  inputMode={loginWithEmail ? "email" : "tel"}
                  placeholder={loginWithEmail ? "name@example.com" : "Enter phone number"}
                  className={cn(
                    "pl-10",
                    (errors.email || errors.phone) &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                  value={loginWithEmail ? email : phone}
                  onChange={e => {
                    if (loginWithEmail) {
                      setEmail(e.target.value)
                      clearError("email")
                    } else {
                      setPhone(e.target.value)
                      clearError("phone")
                    }
                    setServerError("")
                  }}
                  disabled={submitting}
                />
              </div>
              {loginWithEmail && errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
              {!loginWithEmail && errors.phone && (
                <p className="text-xs text-destructive">{errors.phone}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/customer/auth/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password" type={showPwd ? "text" : "password"} autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn("pl-10 pr-10", errors.password && "border-destructive focus-visible:ring-destructive")}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearError("password"); setServerError("") }}
                  disabled={submitting}
                />
                <button type="button" tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
                : "Sign In"
              }
            </Button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* OAuth */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" type="button" onClick={() => window.location.href = "/api/customer/auth/oauth/google"}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </Button>
            <Button variant="outline" type="button" onClick={() => window.location.href = "/api/customer/auth/oauth/facebook"}>
              <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
              </svg>
              Facebook
            </Button>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/customer/auth/register" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
export default function LoginPage() {
  return (
    <SearchParamProvider>
      <PageContent />
    </SearchParamProvider>
  )
}