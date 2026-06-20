"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Eye, EyeOff, Mail, Lock, User, Phone, Loader2, Gift,
  ShoppingBag, AlertCircle, CheckCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { SearchParamProvider } from "@/components/common/searchParamProvider"

// ---- Password strength ---------------------------------------------------
function passwordStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  let score = 0
  if (p.length >= 8)             score++
  if (/[A-Z]/.test(p))          score++
  if (/[0-9]/.test(p))          score++
  if (/[^A-Za-z0-9]/.test(p))   score++
  const labels = ["", "Weak", "Fair", "Good", "Strong"]
  const colors = ["", "bg-red-500", "bg-amber-500", "bg-yellow-500", "bg-emerald-500"]
  return { score: score as any, label: labels[score], color: colors[score] }
}

// ---- Validation ----------------------------------------------------------
function validate(f: typeof INITIAL_FORM): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.full_name.trim())          e.full_name = "Full name is required"
  else if (f.full_name.trim().length < 2) e.full_name = "Full name must be at least 2 characters"

  if (!f.email)                     e.email = "Email is required"
  else if (!/\S+@\S+\.\S+/.test(f.email)) e.email = "Enter a valid email address"

  if (!f.phone)                     e.phone = "Phone number is required"
  else if (!/^\+?[1-9]\d{9,14}$/.test(f.phone.replace(/\s/g, "")))
    e.phone = "Enter a valid phone number (e.g. +919876543210)"

  if (!f.password)                  e.password = "Password is required"
  else if (f.password.length < 8)  e.password = "Minimum 8 characters"
  else if (!/[A-Z]/.test(f.password)) e.password = "Must include an uppercase letter"
  else if (!/[0-9]/.test(f.password)) e.password = "Must include a number"

  if (!f.confirmPassword)           e.confirmPassword = "Please confirm your password"
  else if (f.password !== f.confirmPassword) e.confirmPassword = "Passwords do not match"

  if (!f.agreeTerms)                e.agreeTerms = "You must agree to continue"

  if (f.referral_code && !/^[A-Z]{2,10}-[A-Z0-9]{4,12}$/.test(f.referral_code))
    e.referral_code = "Invalid format (e.g. LDR-ABC12345)"

  return e
}

const INITIAL_FORM = {
  full_name: "", email: "", phone: "", password: "",
  confirmPassword: "", referral_code: "", agreeTerms: false,
}

const FEATURES = [
  { emoji: "📅", title: "Easy Scheduling",  sub: "Book pickup & delivery at your convenience" },
  { emoji: "📍", title: "Live Tracking",    sub: "Track your laundry every step of the way" },
  { emoji: "✨", title: "Quality Service",  sub: "Professional care for all your garments" },
]

function PageContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { register, user, isLoading: authLoading } = useAuth()
  const { toast } = useToast()

  const [form,        setForm]        = useState(INITIAL_FORM)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [showPwd,     setShowPwd]     = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [serverError, setServerError] = useState("")
  const [pwdFocused,  setPwdFocused]  = useState(false)

  // Pre-fill referral code from URL
  useEffect(() => {
    const ref = searchParams.get("ref")
    if (ref) setForm(prev => ({ ...prev, referral_code: ref.toUpperCase() }))
  }, [searchParams])

  // Already logged in — redirect
  useEffect(() => {
    if (!authLoading && user?.isVerified && user?.phoneVerified) {
      router.replace("/customer/dashboard")
    }
  }, [user, authLoading, router])

  const set = (field: string, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      [field]: field === "referral_code" && typeof value === "string"
        ? value.toUpperCase() : value,
    }))
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    setServerError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError("")
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
      await register(form.full_name.trim(), form.email.trim().toLowerCase(), form.password, form.phone.trim(), form.referral_code.trim() || undefined)
      // Registration succeeded — navigate to verify page
      router.push(`/customer/auth/verify?email=${encodeURIComponent(form.email)}&phone=${encodeURIComponent(form.phone)}`)
    } catch (err: any) {
      setServerError(err.message || "Registration failed")
    } finally {
      setSubmitting(false)
    }
  }

  const pwd      = form.password
  const strength = pwd ? passwordStrength(pwd) : null

  return (
    // Full-screen two-column layout; left panel hidden on mobile
    <div className="flex min-h-screen">
      <div className="flex w-full md:flex-1 flex-col bg-background">
        {/* Scrollable area for small screens */}
        <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">Create Account</h2>
              <p className="mt-1 text-sm text-muted-foreground">Fill in your details to get started</p>
            </div>

            {/* Server error */}
            {serverError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="full_name" placeholder="Rahul Sharma" autoComplete="name"
                    className={cn("pl-10", errors.full_name && "border-destructive")}
                    value={form.full_name}
                    onChange={e => set("full_name", e.target.value)}
                    disabled={submitting} />
                </div>
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="email" type="email" placeholder="name@example.com" autoComplete="email"
                    className={cn("pl-10", errors.email && "border-destructive")}
                    value={form.email}
                    onChange={e => set("email", e.target.value)}
                    disabled={submitting} />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="phone" type="tel" placeholder="+919876543210" autoComplete="tel"
                    className={cn("pl-10", errors.phone && "border-destructive")}
                    value={form.phone}
                    onChange={e => set("phone", e.target.value)}
                    disabled={submitting} />
                </div>
                {errors.phone
                  ? <p className="text-xs text-destructive">{errors.phone}</p>
                  : <p className="text-xs text-muted-foreground">Include country code, e.g. +91</p>
                }
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="password" type={showPwd ? "text" : "password"} placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn("pl-10 pr-10", errors.password && "border-destructive")}
                    value={form.password}
                    onChange={e => set("password", e.target.value)}
                    onFocus={() => setPwdFocused(true)}
                    onBlur={() => setPwdFocused(false)}
                    disabled={submitting} />
                  <button type="button" tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPwd(v => !v)}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Strength bar */}
                {(pwdFocused || pwd) && strength && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(n => (
                        <div key={n}
                          className={cn("h-1 flex-1 rounded-full transition-all",
                            n <= strength.score ? strength.color : "bg-muted"
                          )} />
                      ))}
                    </div>
                    {strength.score > 0 && (
                      <p className={cn("text-xs font-medium",
                        strength.score <= 1 ? "text-red-500" :
                        strength.score === 2 ? "text-amber-500" :
                        strength.score === 3 ? "text-yellow-600" : "text-emerald-500"
                      )}>
                        {strength.label}
                      </p>
                    )}
                  </div>
                )}
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="confirmPassword" type={showPwd ? "text" : "password"} placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn("pl-10", errors.confirmPassword && "border-destructive",
                      !errors.confirmPassword && form.confirmPassword && form.password === form.confirmPassword && "border-emerald-500"
                    )}
                    value={form.confirmPassword}
                    onChange={e => set("confirmPassword", e.target.value)}
                    disabled={submitting} />
                  {!errors.confirmPassword && form.confirmPassword && form.password === form.confirmPassword && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                </div>
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
              </div>

              {/* Referral Code — optional */}
              <div className="space-y-1.5">
                <Label htmlFor="referral_code" className="flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-primary" />
                  Referral Code
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="referral_code" placeholder="LDR-XXXXXXX"
                  className={cn("font-mono tracking-widest uppercase",
                    errors.referral_code ? "border-destructive" :
                    form.referral_code ? "border-primary/50 bg-primary/5" : ""
                  )}
                  value={form.referral_code}
                  onChange={e => set("referral_code", e.target.value)}
                  maxLength={16}
                  disabled={submitting} />
                {errors.referral_code
                  ? <p className="text-xs text-destructive">{errors.referral_code}</p>
                  : form.referral_code
                  ? <p className="text-xs text-primary">🎉 Referral code will be applied after sign up</p>
                  : <p className="text-xs text-muted-foreground">Have a friend&apos;s referral code? Enter it here.</p>
                }
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3 pt-1">
                <Checkbox id="agreeTerms" checked={form.agreeTerms}
                  onCheckedChange={v => set("agreeTerms", !!v)}
                  disabled={submitting}
                  className={errors.agreeTerms ? "border-destructive" : ""} />
                <label htmlFor="agreeTerms"
                  className={cn("text-sm leading-snug cursor-pointer",
                    errors.agreeTerms ? "text-destructive" : "text-foreground"
                  )}>
                  I agree to the{" "}
                  <Link href="/terms-of-service" className="text-primary underline underline-offset-2 hover:no-underline">
                    Terms of Service
                  </Link>{" "}and{" "}
                  <Link href="/privacy-policy" className="text-primary underline underline-offset-2 hover:no-underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>
              {errors.agreeTerms && <p className="text-xs text-destructive -mt-2">{errors.agreeTerms}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…</>
                  : "Create Account"
                }
              </Button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">OR CONTINUE WITH</span>
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
              Already have an account?{" "}
              <Link href="/customer/auth/login" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
export default function RegisterPage() {
  return (
    <SearchParamProvider>
      <PageContent />
    </SearchParamProvider>
  )
}