'use client'
// components/forms/AddressForm.tsx
// Reusable form used by both /customer/addresses/new and /customer/addresses/[id]/edit

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface AddressFormProps {
  /** When editing — pass existing address values */
  initial?: Partial<AddressFormData>
  addressId?: number
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

  const validate = (): boolean => {
    const errs: typeof errors = {}
    if (!form.label.trim())         errs.label         = 'Label is required'
    if (!form.address_line1.trim()) errs.address_line1  = 'Address line 1 is required'
    if (!form.city.trim())          errs.city           = 'City is required'
    if (!form.country_code.trim())  errs.country_code   = 'Country code is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
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

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Label presets */}
      <Field label="Address Label" required error={errors.label}>
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

      <Field label="Address Line 1" required error={errors.address_line1}>
        <Input value={form.address_line1} onChange={set('address_line1')}
          placeholder="Flat / House No., Building / Street name" maxLength={255} />
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" required error={errors.city}>
          <Input value={form.city} onChange={set('city')} placeholder="City" maxLength={100} />
        </Field>
        <Field label="State">
          <Input value={form.state} onChange={set('state')} placeholder="State" maxLength={100} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="PIN Code">
          <Input value={form.postal_code} onChange={set('postal_code')}
            placeholder="6-digit PIN" maxLength={20} />
        </Field>
        <Field label="Country Code" required error={errors.country_code}>
          <Input value={form.country_code} onChange={set('country_code')}
            placeholder="IN" maxLength={2} className="uppercase" />
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
        <Field label="Contact Name">
          <Input value={form.contact_name} onChange={set('contact_name')}
            placeholder="Person to contact" maxLength={100} />
        </Field>
        <Field label="Contact Phone">
          <Input value={form.contact_phone} onChange={set('contact_phone')}
            placeholder="+91 98765 43210" type="tel" maxLength={20} />
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
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/50 bg-card p-4 transition-all hover:border-border">
        <div className={cn(
          'flex h-5 w-5 items-center justify-center rounded border-2 transition-all',
          form.is_default ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-background'
        )}>
          {form.is_default && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={set('is_default') as any}
          className="sr-only"
        />
        <div>
          <p className="text-sm font-medium text-foreground">Set as default address</p>
          <p className="text-xs text-muted-foreground">This address will be pre-selected when creating orders</p>
        </div>
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
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
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
