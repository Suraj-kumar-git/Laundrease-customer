'use client'

// components/feature-flags.tsx
//
// Platform switches that client components need to read.
//
// The value is resolved ONCE, server-side, in app/customer/layout.tsx and
// handed down through this context. Deliberately not a client fetch: the
// header renders on every page including for logged-out visitors, and a fetch
// there would mean an extra round trip on every navigation plus a visible
// flash of a nav item that is about to disappear.

import { createContext, useContext, type ReactNode } from 'react'

export interface FeatureFlags {
  /** Quick Pickup visible to customers — platform_config.quick_pickup_enabled */
  quickPickup: boolean
}

// Defaults match lib/quick-pickup-config.ts: unset means off, so a component
// rendered outside the provider hides the feature rather than advertising a
// door that may be shut.
const DEFAULTS: FeatureFlags = { quickPickup: false }

const FeatureFlagsContext = createContext<FeatureFlags>(DEFAULTS)

export function FeatureFlagsProvider({
  flags, children,
}: { flags: FeatureFlags; children: ReactNode }) {
  return (
    <FeatureFlagsContext.Provider value={flags}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext)
}
