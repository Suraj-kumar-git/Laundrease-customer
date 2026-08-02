'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Camera, Edit2, Save, X, CheckCircle2, AlertCircle,
  Loader2, Lock, Mail, Phone, User, Calendar,
  ShoppingBag, Star, Wallet, Shield, Trash2, Eye, EyeOff,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { useToast } from '@/hooks/use-toast'
import { FooterPageLayout, PageSection } from '@/components/layout/footer-page-layout'
import { cn } from '@/lib/utils'
import type { CustomerProfile } from '@/types/referral'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`
}

// ---- Avatar with upload -------------------------------------
function ProfileAvatar({
  src, name, size = 96, onUpload, uploading,
}: {
  src: string | null
  name: string
  size?: number
  onUpload?: (file: File) => void
  uploading?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {src ? (
        <Image src={src} alt={name} width={size} height={size}
          className="rounded-full object-cover ring-4 ring-background shadow-md"
          style={{ width: size, height: size }} />
      ) : (
        <div className="flex items-center justify-center rounded-full bg-primary ring-4 ring-background shadow-md"
          style={{ width: size, height: size }}>
          <span className="font-bold text-primary-foreground" style={{ fontSize: size * 0.35 }}>
            {initials}
          </span>
        </div>
      )}

      {onUpload && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
        </>
      )}
    </div>
  )
}

// ---- Editable field -----------------------------------------
function EditableField({
  label, value, name, type = 'text', readonly = false,
  icon: Icon, error, placeholder, onChange, maxLength,
}: {
  label: string; value: string; name: string; type?: string
  readonly?: boolean; icon: React.ComponentType<{ className?: string }>
  error?: string; placeholder?: string
  onChange?: (val: string) => void; maxLength?: number
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type={type} value={value} readOnly={readonly} maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            'w-full rounded-xl border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-all',
            readonly ? 'cursor-not-allowed opacity-60' : 'focus:border-primary focus:ring-2 focus:ring-primary/20',
            error ? 'border-destructive' : 'border-input'
          )} />
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ---- Main page ----------------------------------------------
export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user, updateUser } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ full_name: '', phone: '' })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Password change state
  const [pwSection, setPwSection] = useState(false)
  const [pwData, setPwData] = useState({ current: '', new: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [pwSaving, setPwSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)

  // Email change (OTP-verified) state
  const [emailSection, setEmailSection] = useState(false)
  const [emailStep, setEmailStep] = useState<'enter' | 'otp'>('enter')
  const [newEmail, setNewEmail] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({})
  const [emailSaving, setEmailSaving] = useState(false)

  // Photo upload
  const [photoUploading, setPhotoUploading] = useState(false)

  // Ownership check: only the logged-in user can edit their own profile
  const isOwner = user?.id === id

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/customer/profile', { credentials: 'include' })
        if (res.status === 401) { router.push('/customer/auth/login'); return }
        if (!res.ok) { setNotFound(true); return }
        const json = await res.json()
        if (!json.success) { setNotFound(true); return }
        setProfile(json.data)
        setEditData({ full_name: json.data.full_name, phone: json.data.phone ?? '' })
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    if (isOwner) {
      fetchProfile()
    } else if (!loading) {
      // Non-owner viewing another profile — redirect (profiles are private for now)
      router.push('/')
    }
  }, [id, isOwner])

  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true)
    try {
      const form = new FormData()
      form.append('photo', file)
      const res = await fetch('/api/customer/profile/photo', {
        method: 'POST', body: form, credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed')

      setProfile((prev) => prev ? { ...prev, profile_image: json.data.profile_image } : prev)
      updateUser({ avatar: json.data.profile_image })
      toast({ title: 'Profile photo updated!' })
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' })
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    const errs: Record<string, string> = {}
    if (!editData.full_name.trim() || editData.full_name.trim().length < 2) errs.full_name = 'Name must be at least 2 characters'
    if (editData.phone && !/^\+?[1-9]\d{1,14}$/.test(editData.phone)) errs.phone = 'Invalid phone number'
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return }

    setSaving(true)
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ full_name: editData.full_name.trim(), phone: editData.phone.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.meta?.errors) { setEditErrors(json.meta.errors); return }
        throw new Error(json.error || 'Failed to save')
      }
      setProfile((prev) => prev ? { ...prev, full_name: editData.full_name, phone: editData.phone } : prev)
      updateUser({ name: editData.full_name })
      setEditing(false)
      toast({ title: 'Profile updated!' })
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    const errs: Record<string, string> = {}
    if (!pwData.current) errs.current = 'Current password is required'
    if (!pwData.new || pwData.new.length < 8) errs.new = 'New password must be at least 8 characters'
    if (pwData.new !== pwData.confirm) errs.confirm = 'Passwords do not match'
    if (pwData.current === pwData.new) errs.new = 'New password must differ from current'
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return }

    setPwSaving(true)
    try {
      const res = await fetch('/api/customer/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: pwData.current, new_password: pwData.new }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.meta?.errors) { setPwErrors(json.meta.errors); return }
        throw new Error(json.error)
      }
      setPwData({ current: '', new: '', confirm: '' })
      setPwSection(false)
      toast({ title: 'Password changed successfully!' })
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' })
    } finally {
      setPwSaving(false)
    }
  }

  const handleRequestEmailOtp = async () => {
    const trimmed = newEmail.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailErrors({ new_email: 'Enter a valid email address' }); return
    }
    setEmailSaving(true)
    try {
      const res = await fetch('/api/customer/profile/email/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ new_email: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.meta?.errors) { setEmailErrors(json.meta.errors); return }
        throw new Error(json.error || 'Failed to send code')
      }
      setEmailErrors({})
      setEmailStep('otp')
      toast({ title: 'Verification code sent', description: `Check ${trimmed} for the 6-digit code.` })
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' })
    } finally {
      setEmailSaving(false)
    }
  }

  const handleConfirmEmailOtp = async () => {
    if (!emailOtp.trim()) { setEmailErrors({ otp: 'Enter the 6-digit code' }); return }
    setEmailSaving(true)
    try {
      const res = await fetch('/api/customer/profile/email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otp: emailOtp.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.meta?.errors) { setEmailErrors(json.meta.errors); return }
        throw new Error(json.error || 'Verification failed')
      }
      setProfile((prev) => prev ? { ...prev, email: json.data.email, email_verified: true } : prev)
      setEmailSection(false); setEmailStep('enter'); setNewEmail(''); setEmailOtp(''); setEmailErrors({})
      toast({ title: 'Email address updated!' })
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' })
    } finally {
      setEmailSaving(false)
    }
  }

  if (loading) {
    return (
      <FooterPageLayout>
        <PageSection>
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </PageSection>
      </FooterPageLayout>
    )
  }

  if (notFound || !profile) {
    return (
      <FooterPageLayout>
        <PageSection>
          <div className="mx-auto max-w-md rounded-2xl border border-border/50 bg-muted/30 p-12 text-center">
            <p className="text-lg font-semibold">Profile not found</p>
          </div>
        </PageSection>
      </FooterPageLayout>
    )
  }

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Profile' }]}>
      <PageSection className="py-10 md:py-16">
        <div className="grid gap-8 lg:grid-cols-3">

          {/* Left sidebar */}
          <div className="space-y-5">
            {/* Avatar card */}
            <div className="rounded-2xl border border-border/50 bg-card p-6 text-center shadow-sm">
              <div className="flex justify-center">
                <ProfileAvatar
                  src={profile.profile_image}
                  name={profile.full_name}
                  size={96}
                  onUpload={isOwner ? handlePhotoUpload : undefined}
                  uploading={photoUploading}
                />
              </div>
              <h2 className="mt-4 text-lg font-bold text-foreground">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-2 flex justify-center gap-1">
                {profile.email_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Member since {formatDate(profile.created_at)}
              </p>
            </div>

            {/* Stats */}
            <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Account Stats</h3>
              <div className="space-y-3">
                {[
                  { icon: ShoppingBag, label: 'Total Orders', value: profile.total_orders.toString() },
                  { icon: Star, label: 'Loyalty Points', value: profile.loyalty_points.toString() },
                  { icon: Wallet, label: 'Wallet Balance', value: formatINR(profile.wallet_balance) },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <stat.icon className="h-4 w-4" />
                      {stat.label}
                    </span>
                    <span className="font-semibold text-foreground">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="space-y-6 lg:col-span-2">

            {/* Personal info */}
            <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Personal Information</h3>
                {isOwner && !editing && (
                  <button onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/30 hover:text-primary">
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <EditableField label="Full Name" name="full_name" icon={User}
                  value={editing ? editData.full_name : profile.full_name}
                  readonly={!editing}
                  error={editErrors.full_name}
                  onChange={(v) => { setEditData((p) => ({ ...p, full_name: v })); setEditErrors((p) => { const n = { ...p }; delete n.full_name; return n }) }} />

                <div>
                  <EditableField label="Phone Number" name="phone" icon={Phone}
                    value={editing ? editData.phone : (profile.phone ?? '')}
                    placeholder="+919876543210" maxLength={13}
                    readonly={!editing || profile.phone_verified}
                    error={editErrors.phone}
                    onChange={(v) => {
                      const filtered = v.replace(/[^\d+]/g, '')
                      setEditData((p) => ({ ...p, phone: filtered }))
                      setEditErrors((p) => { const n = { ...p }; delete n.phone; return n })
                    }} />
                  {profile.phone_verified && (
                    <p className="mt-1 text-xs text-muted-foreground">Phone number is verified and cannot be changed here. Contact support if you need to update it.</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <EditableField label="Email Address" name="email" type="email" icon={Mail}
                    value={profile.email} readonly />
                  {isOwner && !emailSection && (
                    <button onClick={() => setEmailSection(true)}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      <Edit2 className="h-3 w-3" /> Change email address
                    </button>
                  )}

                  {emailSection && (
                    <div className="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4">
                      {emailStep === 'enter' ? (
                        <>
                          <label className="mb-1.5 block text-sm font-medium text-foreground">New Email Address</label>
                          <input type="email" value={newEmail}
                            onChange={(e) => { setNewEmail(e.target.value); setEmailErrors((p) => { const n = { ...p }; delete n.new_email; return n }) }}
                            placeholder="you@example.com"
                            className={cn(
                              'w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20',
                              emailErrors.new_email ? 'border-destructive' : 'border-input'
                            )} />
                          {emailErrors.new_email && <p className="mt-1 text-xs text-destructive">{emailErrors.new_email}</p>}
                          <div className="flex gap-3 pt-1">
                            <button onClick={handleRequestEmailOtp} disabled={emailSaving}
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 hover:bg-primary/90">
                              {emailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Send Code
                            </button>
                            <button onClick={() => { setEmailSection(false); setNewEmail(''); setEmailErrors({}) }}
                              className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium text-muted-foreground hover:border-border">
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <label className="mb-1.5 block text-sm font-medium text-foreground">
                            Enter the code sent to {newEmail}
                          </label>
                          <input type="text" inputMode="numeric" maxLength={6} value={emailOtp}
                            onChange={(e) => { setEmailOtp(e.target.value); setEmailErrors((p) => { const n = { ...p }; delete n.otp; return n }) }}
                            placeholder="6-digit code"
                            className={cn(
                              'w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm tracking-widest outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20',
                              emailErrors.otp ? 'border-destructive' : 'border-input'
                            )} />
                          {emailErrors.otp && <p className="mt-1 text-xs text-destructive">{emailErrors.otp}</p>}
                          <div className="flex gap-3 pt-1">
                            <button onClick={handleConfirmEmailOtp} disabled={emailSaving}
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 hover:bg-primary/90">
                              {emailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Verify &amp; Save
                            </button>
                            <button onClick={() => { setEmailStep('enter'); setEmailOtp(''); setEmailErrors({}) }}
                              className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium text-muted-foreground hover:border-border">
                              Back
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {editing && (
                <div className="mt-5 flex gap-3">
                  <button onClick={handleSaveProfile} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-60 hover:bg-primary/90">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </button>
                  <button onClick={() => { setEditing(false); setEditErrors({}); setEditData({ full_name: profile.full_name, phone: profile.phone ?? '' }) }}
                    className="inline-flex items-center gap-2 rounded-xl border border-border/50 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:border-border hover:text-foreground">
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Password */}
            {isOwner && (
              <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Password & Security</h3>
                  </div>
                  {!pwSection && (
                    <button onClick={() => setPwSection(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/30 hover:text-primary">
                      <Lock className="h-3.5 w-3.5" /> Change Password
                    </button>
                  )}
                </div>

                {!pwSection ? (
                  <p className="text-sm text-muted-foreground">
                    Your password was last changed {profile.created_at ? 'when you created your account' : 'recently'}. We recommend using a strong, unique password.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {[
                      { key: 'current', label: 'Current Password', placeholder: '••••••••' },
                      { key: 'new', label: 'New Password', placeholder: 'Min 8 characters' },
                      { key: 'confirm', label: 'Confirm New Password', placeholder: '••••••••' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type={showPw ? 'text' : 'password'}
                            value={pwData[key as keyof typeof pwData]}
                            placeholder={placeholder}
                            onChange={(e) => { setPwData((p) => ({ ...p, [key]: e.target.value })); setPwErrors((p) => { const n = { ...p }; delete n[key]; return n }) }}
                            className={cn(
                              'w-full rounded-xl border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20',
                              pwErrors[key] ? 'border-destructive' : 'border-input'
                            )}
                          />
                          {key === 'current' && (
                            <button type="button" onClick={() => setShowPw((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                        {pwErrors[key] && <p className="mt-1 text-xs text-destructive">{pwErrors[key]}</p>}
                      </div>
                    ))}

                    <div className="flex gap-3">
                      <button onClick={handlePasswordChange} disabled={pwSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 hover:bg-primary/90">
                        {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Update Password
                      </button>
                      <button onClick={() => { setPwSection(false); setPwErrors({}); setPwData({ current: '', new: '', confirm: '' }) }}
                        className="rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:border-border">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Danger zone */}
            {isOwner && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-destructive">
                  <AlertCircle className="h-5 w-5" /> Danger Zone
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Deleting your account is permanent and cannot be undone. All your orders, wallet balance, and data will be removed.
                </p>
                <a href="mailto:support@laundrease.in?subject=Account Deletion Request"
                  className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                  Request Account Deletion
                </a>
              </div>
            )}
          </div>
        </div>
      </PageSection>
    </FooterPageLayout>
  )
}
