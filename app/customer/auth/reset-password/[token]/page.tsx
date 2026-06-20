"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Lock, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token

  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingToken, setIsCheckingToken] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  })

  const [errors, setErrors] = useState({
    password: "",
    confirmPassword: "",
  })

  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setTokenValid(false)
        setTokenError("Invalid reset link.")
        setIsCheckingToken(false)
        return
      }

      try {
        const res = await fetch(`/api/customer/auth/reset-password/${token}`, {
          method: "GET",
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          setTokenValid(false)
          setTokenError(data.error || "This reset link is invalid or expired.")
        } else {
          setTokenValid(true)
          setTokenError("")
        }
      } catch {
        setTokenValid(false)
        setTokenError("Unable to validate reset link. Please try again.")
      } finally {
        setIsCheckingToken(false)
      }
    }

    validateToken()
  }, [token])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target

    setFormData((prev) => ({ ...prev, [name]: value }))

    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }
  }

  const validateForm = () => {
    const newErrors = {
      password: "",
      confirmPassword: "",
    }

    let valid = true

    if (!formData.password) {
      newErrors.password = "Password is required"
      valid = false
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters"
      valid = false
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password"
      valid = false
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
      valid = false
    }

    setErrors(newErrors)
    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return
    if (!tokenValid) return

    setIsLoading(true)

    try {
      const res = await fetch(`/api/customer/auth/reset-password/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: formData.password,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reset password")
      }

      toast({
        title: "Password reset successful",
        description: "Your password has been reset. You can now log in with your new password.",
      })

      router.push("/customer/auth/login")
    } catch (error: any) {
      toast({
        title: "Failed to reset password",
        description: error.message || "There was an error resetting your password. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/customer/auth/login"
          className="mb-6 flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Link>

        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="p-6">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold">Reset Your Password</h1>
              <p className="text-muted-foreground">Enter your new password below.</p>
            </div>

            {isCheckingToken && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating reset link...
              </div>
            )}

            {!isCheckingToken && !tokenValid && (
              <div className="space-y-4">
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {tokenError}
                </div>

                <Button asChild className="w-full">
                  <Link href="/customer/auth/forgot-password">
                    Request a new reset link
                  </Link>
                </Button>
              </div>
            )}

            {!isCheckingToken && tokenValid && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className={`pl-10 ${errors.password ? "border-red-500" : ""}`}
                      value={formData.password}
                      onChange={handleChange}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-3 text-muted-foreground"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className={`pl-10 ${errors.confirmPassword ? "border-red-500" : ""}`}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      disabled={isLoading}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-500">{errors.confirmPassword}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Resetting..." : "Reset Password"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}