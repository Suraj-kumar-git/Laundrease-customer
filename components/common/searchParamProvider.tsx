"use client"

import { Suspense, ReactNode } from "react"

interface SearchParamProviderProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Global wrapper to satisfy Next.js CSR Bailout requirements
 * for any component using useSearchParams()
 */
export function SearchParamProvider({ 
  children, 
  fallback = <div className="p-8 text-center animate-pulse text-muted-foreground">Loading...</div> 
}: SearchParamProviderProps) {
  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  )
}
