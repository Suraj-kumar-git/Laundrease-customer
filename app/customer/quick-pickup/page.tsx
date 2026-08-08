'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Phone, Mail, MapPin, Zap, Clock, CheckCircle2,
  AlertCircle, Loader2, Search, Star, ArrowRight,
  MessageSquare, PhoneCall, Package, Sparkles,
  CreditCard, ShieldCheck, ChevronRight,
} from 'lucide-react'
import { FooterPageLayout, PageSection, SectionHeading } from '@/components/layout/footer-page-layout'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import type { NearbyProvider, ServiceType } from '@/types/pricing'

// ---- Callback request form ----------------------------------
function CallbackForm() {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    pincode: '',
    service_type: 'standard' as ServiceType,
    services_interested: [] as string[],
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [servicesList, setServicesList] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/customer/public/services?active=true')
      .then(res => res.json())
      .then(json => { if (json.success) setServicesList(json.data.services.map((s: { name: string }) => s.name)) })
      .catch(() => {})
  }, [])

  const set = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const toggleService = (svc: string) => {
    setForm((prev) => ({
      ...prev,
      services_interested: prev.services_interested.includes(svc)
        ? prev.services_interested.filter((s) => s !== svc)
        : [...prev.services_interested, svc],
    }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.full_name.trim()) errs.full_name = 'Name is required'
    if (!form.phone.trim()) errs.phone = 'Phone is required'
    else if (!/^\+?[6-9]\d{9}$/.test(form.phone.trim())) errs.phone = 'Enter a valid 10-digit mobile number'
    if (!form.pincode.trim()) errs.pincode = 'Pincode is required'
    else if (!/^\d{6}$/.test(form.pincode.trim())) errs.pincode = 'Enter a valid 6-digit pincode'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      const res = await fetch('/api/customer/public/quick-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, request_mode: 'callback', source: 'quick_pickup_page' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (data?.meta?.errors) setErrors(data.meta.errors)
        else setErrors({ _form: data?.error || 'Something went wrong. Please try again.' })
        return
      }
      setSubmitted(true)
    } catch {
      setErrors({ _form: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h3 className="mt-4 text-xl font-semibold text-foreground">Request received!</h3>
        <p className="mt-2 text-muted-foreground">
          Our team will call you at <strong>{form.phone}</strong> within the next 2 hours.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          We operate Monday–Saturday, 9 AM–8 PM.
        </p>
        <button
          onClick={() => { setSubmitted(false); setForm({ full_name: '', phone: '', email: '', pincode: '', service_type: 'standard', services_interested: [], notes: '' }) }}
          className="mt-6 text-sm text-primary hover:underline"
        >
          Submit another request
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errors._form && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {errors._form}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Full Name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
            placeholder="Rahul Sharma"
            className={cn(
              'w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20',
              errors.full_name ? 'border-destructive focus:border-destructive' : 'border-input focus:border-primary'
            )}
          />
          {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Phone Number <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+91</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="9876543210"
              className={cn(
                'w-full rounded-xl border bg-background py-2.5 pl-12 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20',
                errors.phone ? 'border-destructive focus:border-destructive' : 'border-input focus:border-primary'
              )}
            />
          </div>
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Email <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="rahul@email.com"
            className={cn(
              'w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20',
              errors.email ? 'border-destructive' : 'border-input focus:border-primary'
            )}
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>

        {/* Pincode */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Pincode <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={form.pincode}
              onChange={(e) => set('pincode', e.target.value)}
              placeholder="411045"
              maxLength={6}
              className={cn(
                'w-full rounded-xl border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20',
                errors.pincode ? 'border-destructive' : 'border-input focus:border-primary'
              )}
            />
          </div>
          {errors.pincode && <p className="mt-1 text-xs text-destructive">{errors.pincode}</p>}
        </div>
      </div>

      {/* Service type */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Service Type</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'standard', label: 'Standard', sublabel: '24–48 hrs', icon: Clock, color: 'text-primary' },
            { value: 'express', label: 'Express', sublabel: '8–12 hrs · 1.5× price', icon: Zap, color: 'text-amber-500' },
          ] as const).map(({ value, label, sublabel, icon: Icon, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => set('service_type', value)}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                form.service_type === value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border/50 bg-card hover:border-border'
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0', color)} />
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Services interested */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Services Needed <span className="text-muted-foreground text-xs">(select all that apply)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {servicesList.map((svc) => (
            <button
              key={svc}
              type="button"
              onClick={() => toggleService(svc)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                form.services_interested.includes(svc)
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'border border-border/50 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
              )}
            >
              {svc}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Additional Notes <span className="text-muted-foreground text-xs">(optional)</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Best time to call, number of bags, special instructions..."
          rows={3}
          className="w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg disabled:opacity-60"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <PhoneCall className="h-4 w-4" /> Request Callback
          </span>
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        We&apos;ll call you within 2 hours · Mon–Sat, 9 AM–8 PM
      </p>
    </form>
  )
}

// ---- Find provider tab --------------------------------------
function FindProviderTab() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<NearbyProvider[] | null>(null)
  const [covered, setCovered] = useState<boolean | null>(null)

  const handleSearch = async () => {
    const val = query.trim()
    if (!val) { setError('Enter a pincode or area/city name'); return }
    setError(null)
    setLoading(true)
    try {
      // A 6-digit value is treated as a pincode; anything else is searched as a city/area name.
      const isPincode = /^\d{6}$/.test(val)
      const param = isPincode ? `pincode=${val}` : `city=${encodeURIComponent(val)}`
      const res = await fetch(`/api/customer/public/pricing/providers-by-area?${param}`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setProviders(json.data.providers)
      setCovered(json.data.covered)
    } catch {
      setError('Could not fetch providers. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(null); setProviders(null); setCovered(null) }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter pincode or area/city name"
            className={cn(
              'w-full rounded-xl border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20',
              error ? 'border-destructive' : 'border-input focus:border-primary'
            )}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Find
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {/* Results */}
      {providers !== null && (
        <div>
          {!covered || providers.length === 0 ? (
            <div className="rounded-2xl border border-border/50 bg-muted/30 p-8 text-center">
              <MapPin className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 font-medium text-foreground">No providers in {query} yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;re expanding. Try a nearby pincode or area{user ? '.' : (
                  <>
                    {' '}or{' '}
                    <Link href="/customer/auth/register" className="text-primary hover:underline">
                      sign up
                    </Link>{' '}
                    for updates.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {providers.length} provider{providers.length !== 1 ? 's' : ''} found in {query}
              </p>
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground">{provider.business_name}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {Number(provider.rating).toFixed(1)}
                        </span>
                        {provider.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {provider.city}
                          </span>
                        )}
                        {provider.address_line1 && (
                          <span className="truncate max-w-[200px]">{provider.address_line1}</span>
                        )}
                        {provider.landmark && (
                          <span className="text-muted-foreground/70">Near {provider.landmark}</span>
                        )}
                      </div>
                      {provider.services_offered && provider.services_offered.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {provider.services_offered.slice(0, 4).map((svc) => (
                            <span
                              key={svc}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {svc}
                            </span>
                          ))}
                          {provider.services_offered.length > 4 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              +{provider.services_offered.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {provider.contact_person_phone && (
                      <a
                        href={`tel:${provider.contact_person_phone}`}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                      >
                        <Phone className="h-4 w-4" />
                        <span className="hidden sm:inline">Call</span>
                        <span className="sm:hidden">{provider.contact_person_phone}</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Page ---------------------------------------------------
export default function QuickPickupPage() {
  const [activeTab, setActiveTab] = useState<'callback' | 'find'>('callback')
  const { user } = useAuth()

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Quick Pickup' }]}>
      {/* Main section: tabs */}
      <PageSection className="pt-10">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Zap className="h-3 w-3" />
            Quick Pickup
          </span>
          <p className="text-sm text-muted-foreground">No account needed — we&apos;ll call you back, or connect you directly with a provider.</p>
        </div>
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Form */}
          <div className="lg:col-span-3">
            {/* Tab switcher */}
            <div className="mb-6 flex gap-2 rounded-xl border border-border/50 bg-muted/30 p-1">
              {([
                { id: 'callback', label: 'Request a Callback', icon: PhoneCall },
                { id: 'find', label: 'Find & Call a Provider', icon: Search },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all',
                    activeTab === id
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{id === 'callback' ? 'Callback' : 'Find Provider'}</span>
                </button>
              ))}
            </div>

            {activeTab === 'callback' ? <CallbackForm /> : <FindProviderTab />}
          </div>

          {/* Sidebar: how it works */}
          <div className="space-y-5 lg:col-span-2">
            <div className="rounded-2xl border border-border/50 bg-card p-6">
              <h3 className="mb-5 font-semibold text-foreground">How Callback Works</h3>
              <div className="space-y-4">
                {[
                  { step: '1', icon: MessageSquare, title: 'Fill the form', body: 'Takes 60 seconds. Just your name, phone, and pincode.' },
                  { step: '2', icon: PhoneCall, title: 'We call you', body: 'Our team calls within 2 hours to confirm details and pickup time.' },
                  { step: '3', icon: Package, title: 'Pickup arranged', body: 'A verified partner picks up your laundry at the agreed time.' },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {item.step}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing note */}
            <div className="rounded-2xl border border-border/50 bg-card p-6">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-primary" />
                Quick Pickup Pricing
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Standard Service</p>
                    <p className="text-muted-foreground">Regular platform rates apply. 24–48 hour turnaround.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="font-medium text-foreground">Express / Urgent</p>
                    <p className="text-muted-foreground">1.5× the standard rate. 8–12 hour turnaround.</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Final pricing is confirmed by the provider on the call. No hidden charges.
                </p>
              </div>
            </div>

            {/* Platform CTA — guests only; signed-in users already have an account */}
            {!user && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <Sparkles className="mb-3 h-6 w-6 text-primary" />
                <h3 className="font-semibold text-foreground">
                  Want more control over your order?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign up for free to choose your provider, track your order in real-time, apply coupons, and save addresses.
                </p>
                <Link
                  href="/customer/auth/register"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                >
                  Create Free Account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </PageSection>

      {/* What's included + safety */}
      <div className="border-t border-border/50 bg-muted/20">
        <PageSection>
          <SectionHeading
            title="What You Can Expect"
            subtitle="Every quick pickup goes through the same quality and safety checks as regular platform orders."
            centered
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Verified Partners', body: 'Only background-checked, verified laundry providers handle your clothes.' },
              { icon: Package, title: 'Barcode Tracking', body: 'Your items are tagged and tracked from pickup to delivery — no items get lost.' },
              { icon: Star, title: 'Quality Check', body: 'Every order goes through a quality inspection before it\'s packed for delivery.' },
              { icon: PhoneCall, title: 'Direct Contact', body: 'You can call the provider directly throughout the process if needed.' },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-border/50 bg-card p-5 text-center">
                <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-6 w-6" />
                </div>
                <h4 className="font-semibold text-foreground">{item.title}</h4>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </PageSection>
      </div>
    </FooterPageLayout>
  )
}
