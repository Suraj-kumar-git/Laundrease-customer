// app/api/customer/public/pincode/route.ts
// GET ?pincode=411045 — public lookup used by the address form to
// auto-fill city/state once a 6-digit PIN code is entered, instead of
// asking the customer to type something we can already derive.
// Proxies India Post's public pincode API server-side (avoids CORS and
// keeps the upstream provider swappable in one place).

import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/api-response'

interface PostOffice {
  Name: string
  District: string
  State: string
}
interface PincodeApiResult {
  Status: string
  PostOffice: PostOffice[] | null
}

export async function GET(req: NextRequest) {
  try {
    const pincode = req.nextUrl.searchParams.get('pincode')?.trim()
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return errorResponse('A valid 6-digit pincode is required', 400)
    }

    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return successResponse({ found: false })

    const [result]: PincodeApiResult[] = await res.json()
    const office = result?.PostOffice?.[0]
    if (result?.Status !== 'Success' || !office) {
      return successResponse({ found: false })
    }

    return successResponse({
      found: true,
      city:  office.District,
      state: office.State,
    })
  } catch (error) {
    console.error('[GET /api/customer/public/pincode]', error)
    // Non-fatal — the form falls back to manual entry
    return successResponse({ found: false })
  }
}
