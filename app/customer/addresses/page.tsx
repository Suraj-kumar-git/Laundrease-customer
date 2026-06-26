'use client'
// app/customer/addresses/page.tsx
// Shows all saved addresses.
// Add → navigates to /customer/addresses/new (page, not popup)
// Edit → navigates to /customer/addresses/[id]/edit
// Delete → calls API with confirmation dialog

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Plus, Home, Briefcase, Building2,
  Edit2, Trash2, Star, Loader2, AlertCircle,
  Phone, Navigation, CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface Address {
  id:             number
  label:          string
  address_line1:  string
  address_line2:  string | null
  landmark:       string | null
  neighborhood:   string | null
  city:           string
  state:          string | null
  postal_code:    string | null
  country_code:   string
  instructions:   string | null
  contact_name:   string | null
  contact_phone:  string | null
  is_default:     boolean
  position:       number
}

function AddressIcon({ label }: { label: string }) {
  const l = label?.toLowerCase() ?? ''
  if (l.includes('home'))                           return <Home className="h-5 w-5" />
  if (l.includes('work') || l.includes('office'))  return <Briefcase className="h-5 w-5" />
  return <Building2 className="h-5 w-5" />
}

// ---- Confirm delete dialog ----------------------------------
function ConfirmDialog({
  label, onConfirm, onCancel, loading,
}: { label: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-sm rounded-2xl bg-background p-5 shadow-2xl"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <Trash2 className="h-5 w-5 text-destructive" />
        </div>
        <h3 className="mb-2 text-base font-bold text-foreground">Remove address?</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">"{label}"</span> will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-border/50 py-3 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive py-3 text-sm font-semibold text-destructive-foreground disabled:opacity-50 hover:bg-destructive/90">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---- Main page ----------------------------------------------
export default function AddressesPage() {
  const { toast }   = useToast()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<number | null>(null) // address id being deleted
  const [confirmId, setConfirmId] = useState<number | null>(null) // dialog open for this id

  const fetchAddresses = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/customer/addresses', { credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed')
      setAddresses(json.data?.addresses ?? json.data ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAddresses() }, [fetchAddresses])

  const handleDelete = async (id: number) => {
    setDeleting(id)
    try {
      const res  = await fetch(`/api/customer/addresses/manage?id=${id}`, {
        method: 'DELETE', credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed')
      setAddresses(prev => prev.filter(a => a.id !== id))
      toast({ title: 'Address removed', description: 'The address has been deleted' })
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  const toDelete = addresses.find(a => a.id === confirmId)

  return (
    <>
      <div className="container mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Addresses</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {addresses.length}/10 addresses saved
            </p>
          </div>
          {addresses.length < 10 && (
            <Link
              href="/customer/addresses/new"
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Address</span>
              <span className="sm:hidden">Add</span>
            </Link>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" onClick={fetchAddresses}
              className="mt-3 text-xs text-primary hover:underline">Try again</button>
          </div>
        ) : addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-16 text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium text-foreground">No addresses saved</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first address to start placing orders
            </p>
            <Link
              href="/customer/addresses/new"
              className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Add First Address
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {addresses.map(addr => (
                <motion.div
                  key={addr.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    'rounded-2xl border bg-card p-4 transition-all',
                    addr.is_default ? 'border-primary/40 shadow-sm shadow-primary/5' : 'border-border/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn(
                      'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      addr.is_default ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <AddressIcon label={addr.label} />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{addr.label}</h3>
                        {addr.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Star className="h-2.5 w-2.5 fill-primary" /> Default
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">{addr.address_line1}</p>
                      {addr.address_line2 && (
                        <p className="text-sm text-muted-foreground">{addr.address_line2}</p>
                      )}
                      {addr.landmark && (
                        <p className="text-xs text-muted-foreground">Near: {addr.landmark}</p>
                      )}
                      <p className="text-sm font-medium text-foreground">
                        {addr.city}{addr.state ? `, ${addr.state}` : ''}
                        {addr.postal_code ? ` - ${addr.postal_code}` : ''}
                      </p>
                      {addr.contact_phone && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" /> {addr.contact_phone}
                        </p>
                      )}
                      {addr.instructions && (
                        <p className="mt-1 text-xs text-muted-foreground italic">
                          {addr.instructions}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3">
                    {/* Maps link */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [addr.address_line1, addr.city, addr.postal_code].filter(Boolean).join(', ')
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Navigation className="h-3.5 w-3.5" /> View on map
                    </a>

                    <div className="flex items-center gap-2">
                      {/* Edit */}
                      <Link
                        href={`/customer/addresses/${addr.id}/edit`}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </Link>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => setConfirmId(addr.id)}
                        disabled={deleting === addr.id}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {deleting === addr.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                        Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            </div>

            {/* Max limit notice */}
            {addresses.length >= 10 && (
              <div className="flex items-center gap-2 rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                You have reached the maximum of 10 addresses. Remove one to add another.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {confirmId && toDelete && (
          <ConfirmDialog
            label={toDelete.label}
            onConfirm={() => handleDelete(confirmId)}
            onCancel={() => setConfirmId(null)}
            loading={deleting === confirmId}
          />
        )}
      </AnimatePresence>
    </>
  )
}
