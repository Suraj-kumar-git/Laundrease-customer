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
import { OAuthButtons } from "@/components/oauth-buttons"
import { isValidEmail, isValidIndianMobile, toTenDigits } from "@/lib/validation/india"

function validate(loginWithEmail: boolean, email: string, phone: string, password: string
): Record<string, string> {
  const e: Record<string, string> = {}
  if (loginWithEmail) {
    if (!email.trim()) {
      e.email = "Email is required"
    } else if (!isValidEmail(email)) {
      e.email = "Enter a valid email address"
    }
  } else {
    if (!phone) {
      e.phone = "Phone number is required"
    } else if (!isValidIndianMobile(phone)) {
      e.phone = "Enter a valid 10-digit mobile number"
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
          : { phone: `+91${phone}`, password }
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
    <div className="flex flex-1">
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
                  inputMode={loginWithEmail ? "email" : "numeric"}
                  maxLength={loginWithEmail ? undefined : 10}
                  placeholder={loginWithEmail ? "name@example.com" : "9876543210"}
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
                      setPhone(toTenDigits(e.target.value))
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

          <OAuthButtons returnTo={returnTo} />

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