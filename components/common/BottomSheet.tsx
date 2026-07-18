'use client'
// components/common/BottomSheet.tsx
// Shared bottom-sheet modal: full-width sheet sliding up from the bottom on
// mobile, centered card on sm:+. Extracted from the SheetModal originally
// built for app/customer/support/page.tsx — same visual behavior, generic.
// Wrap usage in <AnimatePresence> at the call site for the exit animation.

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function BottomSheet({ onClose, children, widthClass = 'sm:max-w-lg' }: {
  onClose: () => void; children: React.ReactNode; widthClass?: string
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className={cn(
            'pointer-events-auto flex w-full flex-col bg-background',
            'max-h-[92vh] rounded-t-3xl border-t border-border/50 overflow-y-auto',
            'sm:max-h-[85vh] sm:rounded-2xl sm:border',
            widthClass
          )}
        >
          {children}
        </motion.div>
      </div>
    </>
  )
}
