'use client'
// components/reviews/ReviewModal.tsx
// Popup review form triggered by clicking stars on an order card.
// Shows service rating, delivery rating, overall rating, comment, anonymous toggle.

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, X, Loader2, CheckCircle2, MessageSquare, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface ReviewModalProps {
  open:                  boolean
  onClose:               () => void
  orderId:               number
  orderNumber:           string
  providerName?:         string | null
  deliveryPartnerName?:  string | null
  hasProvider:           boolean
  hasDelivery:           boolean
  existingReview?:       ExistingReview | null
  onSaved?:              () => void
}

interface ExistingReview {
  service_rating?:  number | null
  delivery_rating?: number | null
  overall_rating?:  number | null
  comment?:         string | null
  is_anonymous?:    boolean
}

// ---- Star picker -------------------------------------------------------------
function StarPicker({
  value, onChange, size = 'lg', label,
}: {
  value: number; onChange: (v: number) => void; size?: 'sm' | 'lg'; label: string
}) {
  const [hovered, setHovered] = useState(0)
  const sz = size === 'lg' ? 'h-9 w-9' : 'h-6 w-6'

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star className={cn(
              sz, 'transition-colors',
              n <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'fill-muted text-muted-foreground/30'
            )} />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-sm font-semibold text-amber-500">
            {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][value]}
          </span>
        )}
      </div>
    </div>
  )
}

// ---- Modal ------------------------------------------------------------------
export function ReviewModal({
  open, onClose, orderId, orderNumber, providerName, deliveryPartnerName,
  hasProvider, hasDelivery, existingReview, onSaved,
}: ReviewModalProps) {
  const { toast } = useToast()
  const [serviceRating,  setServiceRating]  = useState(existingReview?.service_rating  ?? 0)
  const [deliveryRating, setDeliveryRating] = useState(existingReview?.delivery_rating ?? 0)
  const [overallRating,  setOverallRating]  = useState(existingReview?.overall_rating  ?? 0)
  const [comment,        setComment]        = useState(existingReview?.comment         ?? '')
  const [isAnonymous,    setIsAnonymous]    = useState(existingReview?.is_anonymous    ?? false)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)

  // Reset when modal opens with fresh order
  useEffect(() => {
    if (open) {
      setServiceRating(existingReview?.service_rating  ?? 0)
      setDeliveryRating(existingReview?.delivery_rating ?? 0)
      setOverallRating(existingReview?.overall_rating  ?? 0)
      setComment(existingReview?.comment ?? '')
      setIsAnonymous(existingReview?.is_anonymous ?? false)
      setSaved(false)
    }
  }, [open, existingReview])

  const hasAnyRating = serviceRating > 0 || deliveryRating > 0 || overallRating > 0

  const handleSubmit = async () => {
    if (!hasAnyRating) {
      toast({ title: 'Please add at least one rating', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res  = await fetch('/api/customer/reviews', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          order_id:        orderId,
          service_rating:  serviceRating  || null,
          delivery_rating: deliveryRating || null,
          overall_rating:  overallRating  || null,
          comment:         comment.trim() || null,
          is_anonymous:    isAnonymous,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed')
      setSaved(true)
      toast({ title: 'Review saved ✓', description: 'Thank you for your feedback!' })
      onSaved?.()
      setTimeout(() => { onClose(); setSaved(false) }, 1500)
    } catch (err: any) {
      toast({ title: 'Failed to save review', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal — slides up from bottom on mobile, centered on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl bg-background shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4 pt-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">Rate Your Order</h2>
                <p className="text-xs text-muted-foreground font-mono">#{orderNumber}</p>
              </div>
              <button
                type="button" onClick={onClose}
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 pb-6 space-y-6">

              {/* Service rating */}
              {hasProvider && (
                <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <StarPicker
                    value={serviceRating}
                    onChange={setServiceRating}
                    label={providerName ? `Laundry Quality — ${providerName}` : 'Laundry Service Quality'}
                  />
                </div>
              )}

              {/* Delivery rating */}
              {hasDelivery && (
                <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <StarPicker
                    value={deliveryRating}
                    onChange={setDeliveryRating}
                    label={deliveryPartnerName ? `Delivery — ${deliveryPartnerName}` : 'Delivery Experience'}
                  />
                </div>
              )}

              {/* Overall rating */}
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <StarPicker
                  value={overallRating}
                  onChange={setOverallRating}
                  label="Overall Experience"
                />
              </div>

              {/* Comment */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Your Feedback <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Tell us what you loved or what we can improve…"
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/1000</p>
              </div>

              {/* Anonymous toggle */}
              <button
                type="button"
                onClick={() => setIsAnonymous(v => !v)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all',
                  isAnonymous
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border/50 bg-muted/20'
                )}
              >
                {isAnonymous
                  ? <EyeOff className="h-4 w-4 shrink-0 text-primary" />
                  : <Eye    className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="flex-1 text-left">
                  <p className={cn('font-medium', isAnonymous ? 'text-primary' : 'text-foreground')}>
                    Post anonymously
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your name won't be shown with this review
                  </p>
                </div>
                <div className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  isAnonymous ? 'bg-primary' : 'bg-muted-foreground/25'
                )}>
                  <span className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    isAnonymous ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  )} />
                </div>
              </button>

              {/* Submit */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasAnyRating || saving || saved}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {saved   ? <><CheckCircle2 className="h-5 w-5" /> Saved!</> :
                 saving  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> :
                 'Submit Review'}
              </button>

              {!hasAnyRating && (
                <p className="text-center text-xs text-muted-foreground">
                  Please select at least one star rating to submit
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
