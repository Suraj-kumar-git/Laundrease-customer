'use client'
// app/customer/orders/create/components/SchedulePickup.tsx

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'
import { cn } from '@/lib/utils'
import type { LaundryProvider } from '../../types'

interface SchedulePickupProps {
  provider: LaundryProvider
  onSelect: (date: string, timeSlot: string) => void
}

interface TimeSlot {
  id: string; label: string; start_time: string; end_time: string; available: boolean
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function SchedulePickup({ provider, onSelect }: SchedulePickupProps) {
  const [selectedDate,     setSelectedDate]     = useState<Date | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null)
  const [availableDates,   setAvailableDates]   = useState<Date[]>([])
  const [timeSlots,        setTimeSlots]        = useState<TimeSlot[]>([])
  const [closedDates,      setClosedDates]      = useState<string[]>([])

  useEffect(() => {
    const dates: Date[] = []
    const today = startOfDay(new Date())
    for (let i = 1; i <= 14; i++) dates.push(addDays(today, i))
    setAvailableDates(dates)
    // Auto-select tomorrow
    setSelectedDate(dates[0])

    fetch(`/api/customer/laundry-providers/${provider.id}/closed-dates`)
      .then(r => r.json())
      .then(j => { if (j.success) setClosedDates(j.data?.closed_dates ?? []) })
      .catch(() => {})
  }, [provider.id])

  useEffect(() => {
    if (selectedDate) generateTimeSlots(selectedDate)
  }, [selectedDate])

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
    if (!provider.operating_hours || typeof provider.operating_hours !== 'object') {
      setTimeSlots([
        { id: 'morning',   label: 'Morning',   start_time: '09:00', end_time: '12:00', available: true },
        { id: 'afternoon', label: 'Afternoon', start_time: '12:00', end_time: '15:00', available: true },
        { id: 'evening',   label: 'Evening',   start_time: '15:00', end_time: '18:00', available: true },
      ])
      return
    }
    const h = provider.operating_hours[dayName]
    if (h === 'closed' || !h) { setTimeSlots([]); return }

    const openHour  = parseInt(h.open?.split(':')[0]  ?? '9')
    const closeHour = parseInt(h.close?.split(':')[0] ?? '18')
    const slots: TimeSlot[] = []
    if (openHour < 12) slots.push({ id: 'morning', label: 'Morning',
      start_time: `${String(openHour).padStart(2,'0')}:00`,
      end_time: `${String(Math.min(12, closeHour)).padStart(2,'0')}:00`, available: true })
    if (openHour < 15 && closeHour > 12) slots.push({ id: 'afternoon', label: 'Afternoon',
      start_time: `${String(Math.max(12, openHour)).padStart(2,'0')}:00`,
      end_time: `${String(Math.min(15, closeHour)).padStart(2,'0')}:00`, available: true })
    if (closeHour > 15) slots.push({ id: 'evening', label: 'Evening',
      start_time: `${String(Math.max(15, openHour)).padStart(2,'0')}:00`,
      end_time: `${String(closeHour).padStart(2,'0')}:00`, available: true })
    setTimeSlots(slots)
  }

  const handleDateSelect = (date: Date) => {
    if (!isDateAvailable(date)) return
    setSelectedDate(date)
    setSelectedTimeSlot(null)
  }

  const handleContinue = () => {
    if (!selectedDate || !selectedTimeSlot) return
    const slot = timeSlots.find(s => s.id === selectedTimeSlot)
    onSelect(format(selectedDate, 'yyyy-MM-dd'), `${slot!.start_time}-${slot!.end_time}`)
  }

  const selectedSlot = timeSlots.find(s => s.id === selectedTimeSlot)

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
                  {format(date, 'EEE')}
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
                  onClick={() => setSelectedTimeSlot(slot.id)}
                  className={cn(
                    'flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border/50 bg-card hover:border-primary/30'
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

      {/* Confirmation bar — only when both are selected */}
      {selectedDate && selectedTimeSlot && selectedSlot && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between rounded-2xl bg-primary p-4">
            <div>
              <p className="text-xs font-medium text-primary-foreground/70">Pickup scheduled</p>
              <p className="text-sm font-bold text-primary-foreground">
                {format(selectedDate, 'EEE, d MMM')} · {selectedSlot.label}
              </p>
              <p className="text-xs text-primary-foreground/70">
                {selectedSlot.start_time} – {selectedSlot.end_time}
              </p>
            </div>
            <button type="button"
              onClick={handleContinue}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-primary shadow-sm hover:bg-white/90">
              Continue
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
