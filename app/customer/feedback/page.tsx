'use client'
// app/customer/feedback/page.tsx
// Platform testimonial submission form.
// Fields: star rating, recommendation score (drag 1-10), comment, profession (optional),
//         is_featured toggle, submit → POST /api/customer/testimonials

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Star, Send, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

// ---- NPS score labels --------------------------------------------------------
const NPS_LABELS: Record<number, { text: string; color: string }> = {
  1:  { text: "I regret using the app",           color: 'text-red-600'    },
  2:  { text: "Very disappointed",                color: 'text-red-500'    },
  3:  { text: "Not likely to recommend",          color: 'text-orange-500' },
  4:  { text: "Probably wouldn't recommend",      color: 'text-orange-400' },
  5:  { text: "Neutral — it's okay",              color: 'text-amber-500'  },
  6:  { text: "Might recommend to some",          color: 'text-amber-400'  },
  7:  { text: "Would likely recommend",           color: 'text-lime-500'   },
  8:  { text: "Happy to recommend",               color: 'text-green-500'  },
  9:  { text: "Would strongly recommend",         color: 'text-green-600'  },
  10: { text: "Absolutely love it — 10/10!",      color: 'text-emerald-600'},
}

// ---- Star picker -------------------------------------------------------------
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent']
  return (
    <div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            aria-label={`${n} stars`}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star className={cn(
              'h-10 w-10 transition-colors',
              n <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'fill-muted text-muted-foreground/20'
            )} />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-base font-semibold text-amber-500">{labels[value]}</span>
        )}
      </div>
    </div>
  )
}

// ---- Drag slider (NPS 1-10) --------------------------------------------------
function NPSSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const label = value > 0 ? NPS_LABELS[value] : null
  return (
    <div>
      {/* Number markers */}
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i + 1} className={cn('w-6 text-center font-medium', value === i + 1 && 'text-primary font-bold')}>
            {i + 1}
          </span>
        ))}
      </div>

      {/* Range input */}
      <input
        type="range"
        min={1}
        max={10}
        value={value || 1}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary h-2 cursor-pointer rounded-full"
        style={{
          background: value > 0
            ? `linear-gradient(to right, hsl(var(--primary)) ${(value - 1) / 9 * 100}%, hsl(var(--muted)) ${(value - 1) / 9 * 100}%)`
            : 'hsl(var(--muted))',
        }}
      />

      {/* Endpoint labels */}
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Not at all</span>
        <span>Extremely likely</span>
      </div>

      {/* Dynamic label */}
      <div className={cn(
        'mt-3 min-h-[1.5rem] text-center text-sm font-semibold transition-all',
        label?.color ?? 'text-transparent'
      )}>
        {label?.text ?? '—'}
      </div>
    </div>
  )
}

// ---- Page -------------------------------------------------------------------
export default function FeedbackPage() {
  const { toast } = useToast()
  const [rating,              setRating]             = useState(0)
  const [recommendationScore, setRecommendationScore]= useState(0)
  const [content,             setContent]            = useState('')
  const [profession,          setProfession]         = useState('')
  const [isFeaturedRequest,   setIsFeaturedRequest]  = useState(false)
  const [saving,              setSaving]             = useState(false)
  const [done,                setDone]               = useState(false)

  const isValid = rating > 0 && content.trim().length >= 20 && recommendationScore > 0

  const handleSubmit = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const res  = await fetch('/api/customer/testimonials', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          recommendation_score: recommendationScore,
          content:              content.trim(),
          role:                 profession.trim() || null,
          is_featured_request:  isFeaturedRequest,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed')
      setDone(true)
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ---- Success state --------------------------------------------------------
  if (done) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Thank You! 🙌</h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Your feedback has been submitted and is pending review.
          {isFeaturedRequest && ' If approved, it may appear on our app for others to see.'}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/customer/dashboard"
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Back to Dashboard
          </Link>
          <button type="button" onClick={() => {
            setDone(false); setRating(0); setRecommendationScore(0)
            setContent(''); setProfession(''); setIsFeaturedRequest(false)
          }} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Submit another response
          </button>
        </div>
      </div>
    )
  }

  // ---- Form ----------------------------------------------------------------
  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      {/* Back */}
      <Link href="/customer/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Share Your Experience</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your honest feedback helps us improve and helps others discover Laundrease.
        </p>
      </div>

      <div className="space-y-6">

        {/* 1. Overall star rating */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            How would you rate Laundrease overall? <span className="text-destructive">*</span>
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">Tap a star to rate</p>
          <StarPicker value={rating} onChange={setRating} />
        </div>

        {/* 2. Recommendation score */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            How likely are you to recommend Laundrease to friends or family? <span className="text-destructive">*</span>
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">Drag the slider — 1 is not at all, 10 is extremely likely</p>
          <NPSSlider value={recommendationScore} onChange={setRecommendationScore} />
        </div>

        {/* 3. Written feedback */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <label className="mb-1 block text-sm font-semibold text-foreground">
            Tell us more <span className="text-destructive">*</span>
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Share what you loved, or what we can do better. Minimum 20 characters.
          </p>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="The pickup was on time and my clothes came back looking brand new…"
            rows={5}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className={cn('text-xs', content.trim().length < 20 && content.length > 0 ? 'text-amber-500' : 'text-muted-foreground')}>
              {content.trim().length < 20 && content.length > 0 ? `${20 - content.trim().length} more characters needed` : ''}
            </span>
            <span className="text-xs text-muted-foreground">{content.length}/1000</span>
          </div>
        </div>

        {/* 4. Profession (optional) */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <label className="mb-1 block text-sm font-semibold text-foreground">
            Your profession <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Helps others relate to your feedback, e.g. "Software Engineer, Pune" or "Working Parent"
          </p>
          <input
            type="text"
            value={profession}
            onChange={e => setProfession(e.target.value)}
            placeholder="e.g. Software Engineer, Hinjewadi"
            maxLength={100}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
          />
        </div>

        {/* 5. Feature toggle */}
        <button
          type="button"
          onClick={() => setIsFeaturedRequest(v => !v)}
          className={cn(
            'flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all',
            isFeaturedRequest
              ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
              : 'border-border/50 bg-card hover:border-border'
          )}
        >
          <div className={cn(
            'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            isFeaturedRequest ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('font-semibold text-sm', isFeaturedRequest ? 'text-primary' : 'text-foreground')}>
              Feature my feedback on the app
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              If our team approves, your name and feedback may appear in the "What Our Customers Say" section on the Laundrease homepage. You can opt out at any time by contacting us.
            </p>
          </div>
          {/* Toggle */}
          <div className={cn(
            'mt-1 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
            isFeaturedRequest ? 'bg-primary' : 'bg-muted-foreground/25'
          )}>
            <span className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
              isFeaturedRequest ? 'translate-x-[18px]' : 'translate-x-[2px]'
            )} />
          </div>
        </button>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
            : <><Send className="h-4 w-4" /> Submit Feedback</>}
        </button>

        {!isValid && (
          <p className="text-center text-xs text-muted-foreground">
            {rating === 0 ? 'Please select a star rating' :
             recommendationScore === 0 ? 'Please set a recommendation score' :
             content.trim().length < 20 ? 'Please write at least 20 characters' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
