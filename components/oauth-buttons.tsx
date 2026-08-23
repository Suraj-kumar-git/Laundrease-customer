"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { openOAuthProvider, OAuthCancelledError, type OAuthProvider } from "@/lib/oauth-client"

// Shared by the login and register pages — the two were drifting apart as
// duplicated markup. lib/oauth-client.ts decides which of the three sign-in
// paths actually runs (native sheet / Custom Tab / web redirect); this only
// renders the buttons and reports failures.

export function OAuthButtons({ returnTo }: { returnTo?: string }) {
  const { toast } = useToast()
  const [pending, setPending] = useState<OAuthProvider | null>(null)

  const start = async (provider: OAuthProvider) => {
    setPending(provider)
    try {
      await openOAuthProvider(provider, returnTo)
      // The native path resolves here with a session already set; the other
      // two navigate away, so reaching this line means native succeeded.
      // A full load rather than router.push, so every provider and layout
      // re-reads the freshly set auth cookies.
      window.location.href = returnTo || "/customer/dashboard"
    } catch (error) {
      // Backing out of the account sheet is a normal thing to do, not a
      // failure worth interrupting someone with.
      if (!(error instanceof OAuthCancelledError)) {
        toast({
          title: "Sign-in failed",
          description:
            error instanceof Error ? error.message : "Please try again, or use your email and password.",
          variant: "destructive",
        })
      }
      setPending(null)
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button
        variant="outline"
        type="button"
        onClick={() => start("google")}
        disabled={pending !== null}
      >
        {pending === "google" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        Google
      </Button>
      <Button
        variant="outline"
        type="button"
        onClick={() => start("facebook")}
        disabled={pending !== null}
      >
        {pending === "facebook" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
          </svg>
        )}
        Facebook
      </Button>
    </div>
  )
}
