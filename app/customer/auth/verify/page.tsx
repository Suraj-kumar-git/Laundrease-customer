"use client"
 
import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Mail, Phone, Loader2, CheckCircle2 } from "lucide-react"
 
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { SearchParamProvider } from "@/components/common/searchParamProvider"
import { useAuth } from "@/components/auth-provider"
 
function PageContent() {
  const [emailLoading, setEmailLoading] = useState(false)
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState<'email' | 'phone' | null>(null)
  const [emailOtp, setEmailOtp] = useState(["", "", "", "", "", ""])
  const [phoneOtp, setPhoneOtp] = useState(["", "", "", "", "", ""])
  const [errors, setErrors] = useState({ email: "", phone: "" })
  const [emailCountdown, setEmailCountdown] = useState(60)
  const [phoneCountdown, setPhoneCountdown] = useState(60)
  const [canResendEmail, setCanResendEmail] = useState(false)
  const [canResendPhone, setCanResendPhone] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState({
    email: false,
    phone: false,
  })
 
  const emailInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const phoneInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading, setNewUser } = useAuth()
  const { toast } = useToast()
  const returnTo = searchParams.get('returnTo') || '/customer/dashboard'
 
  const email = searchParams.get("email")
  const phone = searchParams.get("phone")

  useEffect(() => {
    if (authLoading) return
    if (user?.isVerified && (user?.phoneVerified || user?.email)) {
      router.replace(returnTo)
      return;
    }
    if (!email || !phone) {
      router.push("/customer/auth/login")
    }
  }, [user, authLoading, email, phone, returnTo, router])
 
  useEffect(() => {
    if (emailCountdown > 0) {
      const timer = setTimeout(() => setEmailCountdown(emailCountdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResendEmail(true)
    }
  }, [emailCountdown])

  useEffect(() => {
    if (phoneCountdown > 0) {
      const timer = setTimeout(() => setPhoneCountdown(phoneCountdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResendPhone(true)
    }
  }, [phoneCountdown])
 
  const handleOtpChange = (
    type: 'email' | 'phone',
    index: number,
    value: string
  ) => {
    if (!/^\d*$/.test(value)) return
 
    const otp = type === 'email' ? emailOtp : phoneOtp
    const setOtp = type === 'email' ? setEmailOtp : setPhoneOtp
    const inputRefs = type === 'email' ? emailInputRefs : phoneInputRefs
 
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    
    // Clear error when user types
    setErrors(prev => ({ ...prev, [type]: "" }))
 
    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }
 
  const handleKeyDown = (
    type: 'email' | 'phone',
    index: number,
    e: React.KeyboardEvent
  ) => {
    const otp = type === 'email' ? emailOtp : phoneOtp
    const inputRefs = type === 'email' ? emailInputRefs : phoneInputRefs
 
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }
 
  const handlePaste = (type: 'email' | 'phone', e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").slice(0, 6)
    
    if (!/^\d+$/.test(pastedData)) return
 
    const setOtp = type === 'email' ? setEmailOtp : setPhoneOtp
    const newOtp = pastedData.split("")
    while (newOtp.length < 6) newOtp.push("")
    setOtp(newOtp)
  }
 
  // Shared by both verify buttons — verifies just the one OTP that was
  // submitted (the API accepts emailOtp and/or phoneOtp independently),
  // and only routes/creates a session once the response says both are done.
  const verifyOne = async (type: 'email' | 'phone') => {
    const code = (type === 'email' ? emailOtp : phoneOtp).join("")
    if (code.length !== 6) {
      setErrors(prev => ({ ...prev, [type]: `Please enter the complete 6-digit ${type} code` }))
      return
    }

    const setLoading = type === 'email' ? setEmailLoading : setPhoneLoading
    setLoading(true)
    setErrors(prev => ({ ...prev, [type]: "" }))

    try {
      const response = await fetch("/api/customer/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          ...(type === 'email' ? { emailOtp: code } : { phoneOtp: code }),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Only set the error for the field that was actually submitted —
        // never touch the other field's error/state.
        const fieldError = data.data?.errors?.[type] || data.error || "Verification failed"
        setErrors(prev => ({ ...prev, [type]: fieldError }))
        toast({ title: "Verification failed", description: fieldError, variant: "destructive" })
        return
      }

      setVerificationStatus(prev => ({ ...prev, [type]: true }))
      toast({
        title: `${type === 'email' ? 'Email' : 'Phone'} verified!`,
        description: data.data?.bothVerified
          ? "Both email and phone have been verified."
          : `Your ${type} has been verified. Verify your ${type === 'email' ? 'phone' : 'email'} too to continue.`,
      })

      if (data.data?.bothVerified) {
        if (data.data?.requiresApproval) {
          toast({
            title: "Verification successful!",
            description: "Your account is pending admin approval. You'll receive an email once approved.",
          })
          setTimeout(() => {
            router.push(`/${data.data.role}/auth/pending-approval?email=${encodeURIComponent(email!)}`)
          }, 1500)
        } else {
          // Fetch authoritative user from server and set in auth state
          const meRes = await fetch("/api/customer/auth/me", { credentials: "include" })
          if (meRes.ok) {
            const meData = await meRes.json()
            if (meData.success && meData.data?.user) {
              setNewUser({
                id:            String(meData.data.user.id),
                name:          meData.data.user.full_name,
                email:         meData.data.user.email,
                phone:         meData.data.user.phone,
                avatar:        meData.data.user.profile_image,
                role:          meData.data.user.role,
                isVerified:    true,
                phoneVerified: true,
              })
            }
          }
          setTimeout(() => {
            router.push(`/customer/dashboard?userId=${data.data.userId}`)
          }, 1500)
        }
      }
    } catch {
      const fieldError = "Something went wrong. Please try again."
      setErrors(prev => ({ ...prev, [type]: fieldError }))
      toast({ title: "Verification failed", description: fieldError, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }
 
  const handleResend = async (type: 'email' | 'phone') => {
    setResendLoading(type)
    setErrors(prev => ({ ...prev, [type]: "" }))
 
    try {
      const response = await fetch("/api/customer/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type,
          [type]: type === "email" ? email : phone,
        }),
      })
 
      const data = await response.json()
 
      if (!response.ok) {
        throw new Error(data.error || "Failed to resend code")
      }
 
      toast({
        title: "Code resent!",
        description: `A new verification code has been sent to your ${type}.`,
      })
 
      if (type === 'email') {
        setEmailCountdown(60)
        setCanResendEmail(false)
        setEmailOtp(["", "", "", "", "", ""])
        emailInputRefs.current[0]?.focus()
      } else {
        setPhoneCountdown(60)
        setCanResendPhone(false)
        setPhoneOtp(["", "", "", "", "", ""])
        phoneInputRefs.current[0]?.focus()
      }
    } catch (error: any) {
      toast({
        title: "Failed to resend code",
        description: error.message || "Please try again later.",
        variant: "destructive",
      })
    } finally {
      setResendLoading(null)
    }
  }
 
  if (verificationStatus.email && verificationStatus.phone) {
    return (
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Verification Successful!</h1>
          <p className="text-muted-foreground mb-6">
            Redirecting you to dashboard...
          </p>
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </div>
      </div>
    )
  }
 
  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href="/customer/auth/login"
          className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Link>
 
        <div className="rounded-lg border bg-card shadow-sm p-6">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold mb-2">Verify Your Account</h1>
            <p className="text-muted-foreground text-sm">
              We&apos;ve sent 6-digit codes to your email and phone
            </p>
          </div>
 
          <div className="grid md:grid-cols-2 gap-6">
            {/* Email OTP */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 justify-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Email Verification</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">{email}</p>
                </div>
              </div>
 
              <div>
                <Label className="text-center block mb-3 text-sm">Enter email code</Label>
                <div className="flex gap-2 justify-center" onPaste={(e) => handlePaste('email', e)}>
                  {emailOtp.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { emailInputRefs.current[index] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange('email', index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown('email', index, e)}
                      className={`w-10 h-10 text-center text-lg font-semibold ${
                        verificationStatus.email ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''
                      }`}
                      disabled={emailLoading || verificationStatus.email}
                    />
                  ))}
                </div>
                {errors.email && <p className="text-xs text-red-500 text-center mt-2">{errors.email}</p>}
                {verificationStatus.email && (
                  <p className="text-xs text-green-600 text-center mt-2 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </p>
                )}
              </div>

              {!verificationStatus.email && (
                <Button
                  onClick={() => verifyOne('email')}
                  className="w-full"
                  disabled={emailLoading || emailOtp.some(digit => digit === "")}
                >
                  {emailLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                  ) : (
                    "Verify Email"
                  )}
                </Button>
              )}

              {!canResendEmail ? (
                <p className="text-xs text-muted-foreground text-center">
                  Resend in <span className="font-semibold text-primary">{emailCountdown}s</span>
                </p>
              ) : (
                <Button
                  variant="link"
                  onClick={() => handleResend('email')}
                  disabled={resendLoading === 'email' || verificationStatus.email}
                  className="text-primary text-xs h-auto p-0 mx-auto block"
                >
                  {resendLoading === 'email' ? "Sending..." : "Resend Email Code"}
                </Button>
              )}
            </div>
 
            {/* Phone OTP */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 justify-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Phone Verification</p>
                  <p className="text-xs text-muted-foreground">{phone}</p>
                </div>
              </div>
 
              <div>
                <Label className="text-center block mb-3 text-sm">Enter phone code</Label>
                <div className="flex gap-2 justify-center" onPaste={(e) => handlePaste('phone', e)}>
                  {phoneOtp.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { phoneInputRefs.current[index] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange('phone', index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown('phone', index, e)}
                      className={`w-10 h-10 text-center text-lg font-semibold ${
                        verificationStatus.phone ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''
                      }`}
                      disabled={phoneLoading || verificationStatus.phone}
                    />
                  ))}
                </div>
                {errors.phone && <p className="text-xs text-red-500 text-center mt-2">{errors.phone}</p>}
                {verificationStatus.phone && (
                  <p className="text-xs text-green-600 text-center mt-2 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </p>
                )}
              </div>

              {!verificationStatus.phone && (
                <Button
                  onClick={() => verifyOne('phone')}
                  className="w-full"
                  disabled={phoneLoading || phoneOtp.some(digit => digit === "")}
                >
                  {phoneLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                  ) : (
                    "Verify Phone"
                  )}
                </Button>
              )}

              {!canResendPhone ? (
                <p className="text-xs text-muted-foreground text-center">
                  Resend in <span className="font-semibold text-primary">{phoneCountdown}s</span>
                </p>
              ) : (
                <Button
                  variant="link"
                  onClick={() => handleResend('phone')}
                  disabled={resendLoading === 'phone' || verificationStatus.phone}
                  className="text-primary text-xs h-auto p-0 mx-auto block"
                >
                  {resendLoading === 'phone' ? "Sending..." : "Resend Phone Code"}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
            <p>
              Wrong email or phone?{" "}
              <Link href="/customer/auth/register" className="text-primary hover:underline">
                Update it here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
export default function VerifyPage() {
  return (
    <SearchParamProvider>
      <PageContent />
    </SearchParamProvider>
  )
}