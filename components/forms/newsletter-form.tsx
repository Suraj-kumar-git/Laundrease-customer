"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

export function NewsletterForm() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = email.trim()

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch('/api/customer/public/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'footer' }),
      })

      // Parse regardless of status so we can show API error messages
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const message =
          data?.error ||
          data?.meta?.errors?.email ||
          'Something went wrong. Please try again later.'
        toast({
          title: "Subscription Failed",
          description: message,
          variant: "destructive",
          duration: 5000,
        })
        return
      }

      if (data?.data?.already_subscribed) {
        toast({
          title: "You're already with us! ✨",
          description:
            "Great taste — you're already a subscribed member. Stay tuned, the best deals and updates are heading your way!",
          duration: 6000,
          className:
            "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-none",
        })
      } else {
        toast({
          title: "You're subscribed! 🎉",
          description:
            "You'll receive our latest updates and offers. You can unsubscribe anytime from the emails we send.",
          duration: 5000,
          className:
            "bg-gradient-to-r from-blue-600 to-purple-600 text-white border-none",
        })
      }

      setEmail("")
    } catch {
      // Network failure
      toast({
        title: "Subscription Failed",
        description: "Something went wrong. Please try again later.",
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <Input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-background flex-1"
        disabled={isLoading}
        required
      />
      <Button
        type="submit"
        className="bg-primary hover:bg-primary/90 transition-all duration-300"
        disabled={isLoading}
      >
        {isLoading ? "Subscribing..." : "Subscribe"}
      </Button>
    </form>
  )
}
