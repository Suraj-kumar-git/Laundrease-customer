'use client'
// components/forms/AddressForm.tsx
// Reusable form used by both /customer/addresses/new and /customer/addresses/[id]/edit

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { AddressMapPicker, type ResolvedLocation } from '@/components/common/AddressMapPicker'

interface AddressFormProps {
  /** When editing — pass existing address values */
  initial?: Partial<AddressFormData>
  addressId?: string
  onSuccess?: () => void
}

export interface AddressFormData {
  label:          string
  tags:           string[]
  address_line1:  string
  address_line2:  string
  landmark:       string
  neighborhood:   string
  city:           string
  state:          string
  postal_code:    string
  country_code:   string
  latitude:       number | null
  longitude:      number | null
  instructions:   string
  contact_name:   string
  contact_phone:  string
  is_default:     boolean
}

const LABEL_PRESETS = ['Home', 'Work', 'Other']
const TAG_PRESETS = ['Front Gate', 'Evening Delivery', 'Call Before', 'No Bell', 'Pet Friendly', 'Security Desk']

const EMPTY: AddressFormData = {
  label: '', tags: [], address_line1: '', address_line2: '', landmark: '',
  neighborhood: '', city: '', state: '', postal_code: '', country_code: 'IN',
  latitude: null, longitude: null,
  instructions: '', contact_name: '', contact_phone: '', is_default: false,
}

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function Input({
  value, onChange, placeholder, maxLength, type = 'text',
  className, ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        'w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none',
        'transition-all focus:border-primary focus:ring-2 focus:ring-primary/20',
        'placeholder:text-muted-foreground/60',
        className
      )}
      {...rest}
    />
  )
}

export function AddressForm({ initial, addressId, onSuccess }: AddressFormProps) {
  const router    = useRouter()
  const { toast } = useToast()
  const isEditing = !!addressId

  const [form,   setForm]   = useState<AddressFormData>({ ...EMPTY, ...initial })
  const [errors, setErrors] = useState<Partial<Record<keyof AddressFormData, string>>>({})
  const [saving, setSaving] = useState(false)
  const [customTag, setCustomTag] = useState('')

  // Every address now requires a confirmed map pin — address_line1/city/
  // state/postal_code/country_code/latitude/longitude all come from there,
  // never typed. Editing re-opens the map so an existing pin can be nudged
  // or reconfirmed, same as adding new.
  const [step, setStep] = useState<'location' | 'details'>('location')

  function handleLocationConfirmed(loc: ResolvedLocation) {
    setForm(prev => ({
      ...prev,
      address_line1: loc.address_line1,
      city:          loc.city,
      state:         loc.state,
      postal_code:   loc.postal_code,
      country_code:  loc.country_code,
      latitude:      loc.latitude,
      longitude:     loc.longitude,
    }))
    setStep('details')
  }

  const set = (field: keyof AddressFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const toggleTag = (tag: string) =>
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
    }))

  const addCustomTag = () => {
    const tag = customTag.trim()
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }))
    }
    setCustomTag('')
  }

  const removeTag = (tag: string) =>
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))

  // Live validation — recomputed on every change. Field errors are only
  // *shown* once the field has been touched (or a submit was attempted),
  // and the submit button stays disabled until everything required is valid.
  const computeErrors = (data: AddressFormData): Partial<Record<keyof AddressFormData, string>> => {
    const errs: Partial<Record<keyof AddressFormData, string>> = {}
    if (!data.label.trim())         errs.label         = 'Label is required'
    // address_line1/city/state/postal_code/country_code/lat/lng all come
    // from a confirmed map pin (see the 'location' step) — never typed, so
    // they can't be invalid by the time this form is reachable. Guarded
    // defensively rather than shown as a normal field error.
    if (data.latitude == null || data.longitude == null) errs.address_line1 = 'Please pick a location on the map'
    if (!data.contact_name.trim())  errs.contact_name   = 'Contact name is required'
    // Required — the DB rejects an empty contact_phone (the format CHECK
    // constraint doesn't accept '', only NULL or a valid number), which
    // previously surfaced as a generic "Failed to save address" error.
    if (!data.contact_phone.trim()) {
      errs.contact_phone = 'Contact phone is required'
    } else {
      const digits = data.contact_phone.replace(/^\+91/, '').replace(/\D/g, '')
      if (!/^[6-9]\d{9}$/.test(digits)) errs.contact_phone = 'Enter a valid 10-digit Indian mobile number'
    }
    return errs
  }

  const [touched, setTouched] = useState<Partial<Record<keyof AddressFormData, boolean>>>({})
  const liveErrors = computeErrors(form)
  const formValid  = Object.keys(liveErrors).length === 0

  const touch = (field: keyof AddressFormData) => () =>
    setTouched(prev => ({ ...prev, [field]: true }))

  // Show an error only for touched fields (or after a submit attempt)
  const shownError = (field: keyof AddressFormData): string | undefined =>
    (touched[field] || errors[field]) ? liveErrors[field] : undefined

  const validate = (): boolean => {
    setErrors(liveErrors)
    // Mark everything touched so all remaining errors surface at once
    setTouched({ label: true, contact_name: true, contact_phone: true })
    return formValid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const res = await fetch('/api/customer/addresses/manage', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isEditing ? { ...form, id: addressId } : form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save address')

      toast({
        title: isEditing ? 'Address updated ✓' : 'Address saved ✓',
        description: `"${form.label}" has been ${isEditing ? 'updated' : 'added'} to your addresses`,
      })

      if (onSuccess) onSuccess()
      else router.push('/customer/addresses')
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (step === 'location') {
    return (
      <AddressMapPicker
        initialLat={form.latitude}
        initialLng={form.longitude}
        onConfirm={handleLocationConfirmed}
        onCancel={() => router.push('/customer/addresses')}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Label presets */}
      <Field label="Address Label" required error={shownError('label')}>
        <div className="flex gap-2">
          {LABEL_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => setForm(prev => ({ ...prev, label: preset }))}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm font-medium transition-all',
                form.label === preset
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              {preset}
            </button>
          ))}
          <Input
            value={LABEL_PRESETS.includes(form.label) ? '' : form.label}
            onChange={set('label')}
            placeholder="Custom label…"
            maxLength={50}
            className="flex-1"
            onFocus={() => {
              if (LABEL_PRESETS.includes(form.label)) setForm(prev => ({ ...prev, label: '' }))
            }}
          />
        </div>
      </Field>

      <Field label="Address Line 1" required>
        <div className="flex items-center gap-2">
          <Input value={form.address_line1} disabled
            className="flex-1 disabled:cursor-not-allowed disabled:opacity-70" />
          <button type="button" onClick={() => setStep('location')}
            className="shrink-0 text-xs font-medium text-primary hover:underline">
            Change
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <MapPin className="mr-1 inline h-3 w-3" /> From your pinned location — tap Change to move the pin.
        </p>
      </Field>

      <Field label="Address Line 2">
        <Input value={form.address_line2} onChange={set('address_line2')}
          placeholder="Area / Colony (optional)" maxLength={255} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Landmark">
          <Input value={form.landmark} onChange={set('landmark')}
            placeholder="Near temple, metro station…" maxLength={255} />
        </Field>
        <Field label="Neighbourhood">
          <Input value={form.neighborhood} onChange={set('neighborhood')}
            placeholder="Locality / Area" maxLength={100} />
        </Field>
      </div>

      {/* PIN code / city / state / country all come from the confirmed map
          pin above — locked, same reasoning as Address Line 1. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="PIN Code" required>
          <Input value={form.postal_code} disabled
            className="disabled:cursor-not-allowed disabled:opacity-70" />
        </Field>
        <Field label="City" required>
          <Input value={form.city} disabled
            className="disabled:cursor-not-allowed disabled:opacity-70" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="State">
          <Input value={form.state} disabled
            className="disabled:cursor-not-allowed disabled:opacity-70" />
        </Field>
        <Field label="Country Code">
          <Input value={form.country_code} disabled
            className="uppercase disabled:cursor-not-allowed disabled:opacity-70" />
        </Field>
      </div>

      {/* Delivery instructions */}
      <Field label="Delivery Instructions">
        <textarea
          value={form.instructions}
          onChange={set('instructions') as any}
          placeholder="E.g., call before coming, leave at door, building code…"
          rows={3}
          maxLength={500}
          className={cn(
            'w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm',
            'outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20',
            'placeholder:text-muted-foreground/60'
          )}
        />
      </Field>

      {/* Contact */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact Name" required error={shownError('contact_name')}>
          <Input value={form.contact_name} onChange={set('contact_name')} onBlur={touch('contact_name')}
            placeholder="Person to contact" maxLength={100} />
        </Field>
        <Field label="Contact Phone" required error={shownError('contact_phone')}>
          <Input
            value={form.contact_phone}
            onChange={e => {
              const raw = e.target.value.replace(/[^\d+]/g, '')
              if (raw.length <= 13) setForm(prev => ({ ...prev, contact_phone: raw }))
            }}
            onBlur={touch('contact_phone')}
            placeholder="+91 98765 43210"
            type="tel"
            inputMode="tel"
            maxLength={13}
          />
        </Field>
      </div>

      {/* Tags */}
      <Field label="Tags">
        <div className="flex flex-wrap gap-2">
          {TAG_PRESETS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
                form.tags.includes(tag)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
        {form.tags.filter(t => !TAG_PRESETS.includes(t)).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {form.tags.filter(t => !TAG_PRESETS.includes(t)).map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
              >
                {tag} ×
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <Input
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
            placeholder="Add custom tag…"
            maxLength={50}
            className="flex-1"
          />
          <button type="button" onClick={addCustomTag}
            className="rounded-xl border border-border/50 px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
            Add
          </button>
        </div>
      </Field>

      {/* Default address toggle */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={set('is_default') as any}
          className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus:ring-primary/30"
        />
        <span className="text-sm text-foreground">Set as default address</span>
      </label>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-xl border border-border/50 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !formValid}
          title={!formValid ? 'Fill all required fields (marked *) to continue' : undefined}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            <><MapPin className="h-4 w-4" /> {isEditing ? 'Save Changes' : 'Add Address'}</>
          )}
        </button>
      </div>
    </form>
  )
}
