'use client'
// app/customer/orders/create/components/SchedulePickup.tsx

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, AlertCircle, CheckCircle, Lock } from 'lucide-react'
import { format, addDays, startOfDay, isSameDay } from 'date-fns'
import { cn } from '@/lib/utils'
import type { LaundryProvider, Address } from '../../types'
import type { SlotTier } from '@/lib/delivery-availability'

interface SchedulePickupProps {
  provider: LaundryProvider
  pickupAddress?: Address | null
  onSelect: (date: string, timeSlot: string) => void
  // Previously chosen date/slot (e.g. user navigated forward then came back) —
  // restored once so it doesn't reset on every visit to this step.
  initialDate?: string
  initialTimeSlot?: string
  // Cart context for the sticky bottom bar — services picked in step 2.
  cartItemCount?: number
  cartSubtotal?: number
}

interface TimeSlot {
  id: string; label: string; start_time: string; end_time: string
  available: boolean
  blockedReason?: 'past' | 'fully_booked'
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function SchedulePickup({ provider, pickupAddress, onSelect, initialDate, initialTimeSlot, cartItemCount, cartSubtotal }: SchedulePickupProps) {
  const [selectedDate,     setSelectedDate]     = useState<Date | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null)
  const [availableDates,   setAvailableDates]   = useState<Date[]>([])
  const [timeSlots,        setTimeSlots]        = useState<TimeSlot[]>([])
  const [closedDates,      setClosedDates]      = useState<string[]>([])
  const [slotTier,         setSlotTier]         = useState<SlotTier>('immediate')
  const restoredSlotRef = useRef(false)

  // How backed-up delivery is in this pickup zone right now — determines
  // which of today's slots (if any) are still bookable.
  useEffect(() => {
    const params = new URLSearchParams()
    if (pickupAddress?.postal_code) params.set('postal_code', pickupAddress.postal_code)
    if (pickupAddress?.city)        params.set('city', pickupAddress.city)

    fetch(`/api/customer/delivery-availability?${params}`)
      .then(r => r.json())
      .then(j => { if (j.success) setSlotTier(j.data.tier) })
      .catch(() => setSlotTier('immediate'))
  }, [pickupAddress?.postal_code, pickupAddress?.city])

  useEffect(() => {
    const today = startOfDay(new Date())
    // Today is only offered if delivery isn't saturated enough to push
    // straight to tomorrow, and the provider is actually open today.
    const includeToday = slotTier !== 'tomorrow_only'
    const dates: Date[] = []
    if (includeToday) dates.push(today)
    for (let i = 1; i <= 14; i++) dates.push(addDays(today, i))
    setAvailableDates(dates)

    const restored = initialDate
      ? dates.find(d => format(d, 'yyyy-MM-dd') === initialDate)
      : undefined
    setSelectedDate(restored ?? dates[0])

    fetch(`/api/customer/laundry-providers/${provider.id}/closed-dates`)
      .then(r => r.json())
      .then(j => { if (j.success) setClosedDates(j.data?.closed_dates ?? []) })
      .catch(() => {})
  }, [provider.id, slotTier]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedDate) generateTimeSlots(selectedDate)
  }, [selectedDate, slotTier]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore the previously chosen time slot once, after slots for the
  // restored date have been generated. Only runs the first time — date
  // changes the user makes afterward should reset the slot as normal.
  useEffect(() => {
    if (restoredSlotRef.current) return
    if (!initialTimeSlot || timeSlots.length === 0) return
    const match = timeSlots.find(s => `${s.start_time}-${s.end_time}` === initialTimeSlot && s.available)
    if (match) setSelectedTimeSlot(match.id)
    restoredSlotRef.current = true
  }, [timeSlots, initialTimeSlot])

  const isDateClosed = (d: Date) => closedDates.includes(format(d, 'yyyy-MM-dd'))

  const isDateAvailable = (d: Date) => {
    if (isDateClosed(d)) return false
    const dayName = DAY_NAMES[d.getDay()]
    if (!provider.operating_hours || typeof provider.operating_hours !== 'object') return true
    const h = provider.operating_hours[dayName]
    return h !== 'closed' && h !== undefined
  }

  const generateTimeSlots = (date: Date) => {
    const dayName = DAY_NAMES[date.getDay()]
    const isToday = isSameDay(date, new Date())
    const now = new Date()

    let raw: Omit<TimeSlot, 'available' | 'blockedReason'>[]

    if (!provider.operating_hours || typeof provider.operating_hours !== 'object') {
      raw = [
        { id: 'morning',   label: 'Morning',   start_time: '09:00', end_time: '12:00' },
        { id: 'afternoon', label: 'Afternoon', start_time: '12:00', end_time: '15:00' },
        { id: 'evening',   label: 'Evening',   start_time: '15:00', end_time: '18:00' },
      ]
    } else {
      const h = provider.operating_hours[dayName]
      if (h === 'closed' || !h) { setTimeSlots([]); return }

      const openHour  = parseInt(h.open?.split(':')[0]  ?? '9')
      const closeHour = parseInt(h.close?.split(':')[0] ?? '18')
      raw = []
      if (openHour < 12) raw.push({ id: 'morning', label: 'Morning',
        start_time: `${String(openHour).padStart(2,'0')}:00`,
        end_time: `${String(Math.min(12, closeHour)).padStart(2,'0')}:00` })
      if (openHour < 15 && closeHour > 12) raw.push({ id: 'afternoon', label: 'Afternoon',
        start_time: `${String(Math.max(12, openHour)).padStart(2,'0')}:00`,
        end_time: `${String(Math.min(15, closeHour)).padStart(2,'0')}:00` })
      if (closeHour > 15) raw.push({ id: 'evening', label: 'Evening',
        start_time: `${String(Math.max(15, openHour)).padStart(2,'0')}:00`,
        end_time: `${String(closeHour).padStart(2,'0')}:00` })
    }

    if (!isToday) {
      setTimeSlots(raw.map(s => ({ ...s, available: true })))
      return
    }

    // Today: drop fully-past slots, then apply the workload tier to decide
    // which of the remaining slots are actually bookable.
    const remaining = raw.filter(s => {
      const endHour = parseInt(s.end_time.split(':')[0], 10)
      const slotEnd = new Date(date); slotEnd.setHours(endHour, 0, 0, 0)
      return slotEnd > now
    })

    const pushIndex = slotTier === 'immediate' ? 0
      : slotTier === 'next' ? 1
      : slotTier === 'last_today' ? remaining.length - 1
      : remaining.length // 'tomorrow_only' shouldn't reach here, but be safe

    setTimeSlots(remaining.map((s, i) => ({
      ...s,
      available: i >= pushIndex,
      blockedReason: i < pushIndex ? 'fully_booked' : undefined,
    })))
  }

  const handleDateSelect = (date: Date) => {
    if (!isDateAvailable(date)) return
    setSelectedDate(date)
    setSelectedTimeSlot(null)
  }

  const handleSlotSelect = (slot: TimeSlot) => {
    if (!slot.available) return
    setSelectedTimeSlot(slot.id)
  }

  const handleContinue = () => {
    if (!selectedDate || !selectedTimeSlot) return
    const slot = timeSlots.find(s => s.id === selectedTimeSlot)
    if (!slot?.available) return
    onSelect(format(selectedDate, 'yyyy-MM-dd'), `${slot!.start_time}-${slot!.end_time}`)
  }

  const selectedSlot = timeSlots.find(s => s.id === selectedTimeSlot)
  const allSlotsBlockedToday = useMemo(
    () => selectedDate && isSameDay(selectedDate, new Date()) && timeSlots.length > 0 && timeSlots.every(s => !s.available),
    [selectedDate, timeSlots]
  )

  return (
    <div className="space-y-5">
      {/* Pickup info alert */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Our delivery partner will arrive within the selected window. Please ensure someone is available.
        </p>
      </div>

      {/* Date selection — compact horizontal scroll */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Select Pickup Date</h3>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {availableDates.map(date => {
            const isSelected  = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
            const isAvailable = isDateAvailable(date)
            const isClosed    = isDateClosed(date)
            const isToday     = isSameDay(date, new Date())

            return (
              <button
                type="button"
                key={date.toISOString()}
                onClick={() => handleDateSelect(date)}
                disabled={!isAvailable}
                className={cn(
                  'flex shrink-0 flex-col items-center rounded-xl border px-3 py-2.5 transition-all',
                  'min-w-[52px] text-center',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : isAvailable
                    ? 'border-border/50 bg-card hover:border-primary/40'
                    : 'cursor-not-allowed border-border/30 bg-muted/30 opacity-40'
                )}
              >
                <span className={cn(
                  'text-[10px] font-medium',
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}>
                  {isToday ? 'Today' : format(date, 'EEE')}
                </span>
                <span className={cn(
                  'text-lg font-bold leading-none',
                  isSelected ? 'text-primary-foreground' : 'text-foreground'
                )}>
                  {format(date, 'd')}
                </span>
                <span className={cn(
                  'text-[10px]',
                  isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                )}>
                  {format(date, 'MMM')}
                </span>
                {isClosed && (
                  <span className="mt-1 rounded-full bg-destructive/20 px-1 py-0.5 text-[8px] text-destructive">
                    Closed
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slot selection — compact row */}
      {selectedDate && timeSlots.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Select Time Slot</h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {timeSlots.map(slot => {
              const isSelected = selectedTimeSlot === slot.id
              // Format time display: "9 AM – 12 PM"
              const fmt = (t: string) => {
                const [h] = t.split(':')
                const hr = parseInt(h)
                return hr === 12 ? '12 PM' : hr > 12 ? `${hr - 12} PM` : `${hr} AM`
              }

              return (
                <button
                  type="button"
                  key={slot.id}
                  onClick={() => handleSlotSelect(slot)}
                  disabled={!slot.available}
                  className={cn(
                    'flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : slot.available
                      ? 'border-border/50 bg-card hover:border-primary/30'
                      : 'cursor-not-allowed border-border/30 bg-muted/30 opacity-50'
                  )}
                >
                  <span className={cn(
                    'text-sm font-bold',
                    isSelected ? 'text-primary' : 'text-foreground'
                  )}>
                    {slot.label}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">
                    {fmt(slot.start_time)} – {fmt(slot.end_time)}
                  </span>
                  {isSelected && <CheckCircle className="mt-1.5 h-3.5 w-3.5 text-primary" />}
                  {!slot.available && (
                    <span className="mt-1 flex items-center gap-0.5 text-[8px] font-medium text-muted-foreground">
                      <Lock className="h-2 w-2" /> Fully booked
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}

      {selectedDate && timeSlots.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Provider is closed on this date. Please select another.
        </div>
      )}

      {allSlotsBlockedToday && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Delivery partners are fully booked for today. Please select tomorrow or a later date.
        </div>
      )}

      {/* Sticky cart bar — always visible; Continue unlocks once date + slot
          are picked. Same pattern as the services step's summary bar.
          Offset above the mobile bottom nav (now visible on this page too)
          so the two never overlap; back to the normal gap on lg+, where
          the bottom nav doesn't render at all. */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="sticky bottom-[calc(4rem+1rem+env(safe-area-inset-bottom))] lg:bottom-4 z-10 rounded-2xl bg-primary p-4 shadow-xl shadow-primary/25">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {selectedDate && selectedSlot ? (
              <>
                <p className="text-xs font-medium text-primary-foreground/70">
                  {cartItemCount ? `${cartItemCount} service${cartItemCount !== 1 ? 's' : ''}` : 'Pickup scheduled'}
                  {cartSubtotal != null && cartSubtotal > 0 && ` · ₹${cartSubtotal.toLocaleString('en-IN')}`}
                </p>
                <p className="truncate text-sm font-bold text-primary-foreground">
                  {format(selectedDate, 'EEE, d MMM')} · {selectedSlot.label}
                </p>
                <p className="text-xs text-primary-foreground/70">
                  {selectedSlot.start_time} – {selectedSlot.end_time}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-primary-foreground">
                  {cartItemCount ? `${cartItemCount} service${cartItemCount !== 1 ? 's' : ''}` : 'Your order'}
                  {cartSubtotal != null && cartSubtotal > 0 && ` · ₹${cartSubtotal.toLocaleString('en-IN')}`}
                </p>
                <p className="text-xs text-primary-foreground/70">Select a pickup date & time to continue</p>
              </>
            )}
          </div>
          <button type="button"
            onClick={handleContinue}
            disabled={!selectedDate || !selectedTimeSlot || !selectedSlot?.available}
            className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-primary shadow-sm hover:bg-white/90 disabled:opacity-50">
            Continue
          </button>
        </div>
      </motion.div>
    </div>
  )
}
