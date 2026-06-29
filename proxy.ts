import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
 
const PROTECTED_ROUTES = [
  '/customer/addresses',
  '/customer/checkout',
  '/customer/dashboard',
  '/customer/feedback',
  '/customer/orders',
  '/customer/profile',
  '/customer/refer-and-earn',
  '/customer/settings',
  '/customer/support',
]
 
const PUBLIC_URLs = [
  '/',
  '/customer',
  '/customer/about',
  '/customer/careers/*',
  '/customer/community-guidelines',
  '/customer/faq',
  '/customer/help-center',
  '/customer/pricing-calculator',
  '/customer/privacy-policy',
  '/customer/quick-pickup',
  '/customer/safety-center',
  '/customer/services',
  '/customer/terms-of-service',
  '/customer/auth/forgot-password',
  '/customer/auth/login',
  '/customer/auth/register',
  '/customer/auth/reset-password/*',
  '/customer/auth/verify',
  '/api/customer/laundry-providers/search',
  '/api/customer/payments/payu/success',
  '/api/customer/payments/payu/failure',
  '/api/customer/payments/cashfree/return',
]
 
// API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  '/api/customer/public/*',
  '/api/customer/auth/*',
  '/api/customer/laundry-providers/search',
  '/api/customer/payments/payu/success',
  '/api/customer/payments/payu/failure',
  '/api/customer/payments/cashfree/return',
]
 
// Helper to check if a path is public
function isPublicURL(pathname: string): boolean {
  return PUBLIC_URLs.some(route => {
    if (route.endsWith('*')) {
      return pathname.startsWith(route.slice(0, -1))
    }
    return pathname === route;
  })
}

// Helper to check if API route is public
function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => {
    if (route.endsWith('*')) {
      return pathname.startsWith(route.slice(0, -1))
    }
    return pathname === route;
  })
}
 
function isAuthPage(pathname: string): boolean {
  return pathname.startsWith('/customer/auth/')
}
 
function hasRouteAccess(pathname: string): boolean {
  return PROTECTED_ROUTES.some(route => pathname.startsWith(route))
}
 
function needsVerification(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0]
  return PROTECTED_ROUTES.some(route => path === route || path.startsWith(`${route}/`))
}

function getRoleFromPath(pathname: string): string | null {
  const normalized = pathname.trim()
  if (
    normalized === `/customer` ||
    normalized.startsWith(`/customer/`) ||
    normalized === `/api/customer` ||
    normalized.startsWith(`/api/customer/`)
  ) {
    return 'customer';
  }
  return null;
}

// Verify JWT token
async function verifyToken(token: string): Promise<any> {
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET
    )
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    })
    if (payload.type !== 'access') {
      return null
    }
    return payload
  } catch (error) {
    return null
  }
}

// Verify a refresh_token JWT's signature/expiry only (no DB round trip) —
// used purely as a signal in middleware to avoid a hard logout. The actual
// token rotation happens client-side (AuthProvider's tryRefresh, a normal
// browser fetch with credentials) — an earlier version of this tried to
// rotate the token from inside middleware via a server-to-server self-fetch
// back into this same app, which proved unreliable (the internal request
// could fail for reasons unrelated to the session actually being invalid,
// e.g. token-rotation races), and on failure the page-routes branch below
// would delete cookies and force a real logout even though the customer's
// refresh token was still perfectly good.
async function verifyRefreshTokenSignature(token: string): Promise<Awaited<ReturnType<typeof verifyToken>>> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    if (payload.type !== 'refresh') return null
    return payload
  } catch {
    return null
  }
}
 
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Skip middleware for static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') && !pathname.startsWith('/api')
  ) {
    return NextResponse.next()
  }
  const pathRole = getRoleFromPath(pathname)

  if (pathRole && pathRole !== 'customer') {
    if (pathname.startsWith('/api')) {
      return NextResponse.json(
        { success: false, error: 'Not Found' },
        { status: 404 }
      )
    }
    return NextResponse.rewrite(new URL('/404', request.url))
  }
 
  // Handle API routes
  if (pathname.startsWith('/api')) {
    // Allow public API routes
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next()
    }
    // For protected API routes, verify token
    const accessToken = request.cookies.get('access_token')?.value
    const payload = accessToken ? await verifyToken(accessToken) : null

    if (!payload?.userId) {
      // Never deletes cookies here — a 401 on a data API just means this one
      // call needs a fresh access token. The client retries after rotating
      // it (AuthProvider does this for customer); cookies are left alone.
      return NextResponse.json(
        { success: false, error: accessToken ? 'Invalid or expired token' : 'Unauthorized - Please login' },
        { status: 401 }
      )
    }
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', payload.userId as string)
    requestHeaders.set('x-user-role', payload.role as string)
    requestHeaders.set('x-user-email', payload.email as string)

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }
 
  // Allow public routes
  if (isPublicURL(pathname)) {
    // Next.js automatically prefetches in-viewport <Link> targets — e.g. a
    // "Sign Up" link sitting on the public landing page gets silently
    // prefetched (no click, no real navigation) as soon as it scrolls into
    // view. That prefetch request hits this same middleware. Without this
    // check, a logged-in customer would get logged out just from a register/
    // login link being visible on the page they're already on — never
    // actually clicking it. Only react to a real navigation.
    const isPrefetch =
      request.headers.get('next-router-prefetch') === '1' ||
      request.headers.get('purpose') === 'prefetch' ||
      request.headers.get('sec-purpose') === 'prefetch'

    if (isAuthPage(pathname) && !isPrefetch) {
      const token = request.cookies.get('access_token')?.value
      if (token) {
        const payload = await verifyToken(token)
        if (payload?.userId) {
          // Logged-in user trying to access an auth page — clear session and let through
          const response = NextResponse.next()
          response.cookies.delete('access_token')
          response.cookies.delete('refresh_token')
          return response
        }
      }
    }
    return NextResponse.next()
  }
  // Get access token from cookies
  const accessToken = request.cookies.get('access_token')?.value
  // Verify token (if present)
  const payload = accessToken ? await verifyToken(accessToken) : null

  if (!payload?.userId || !payload?.role) {
    // Customer-only: an expired/missing access token isn't necessarily a dead
    // session. If the refresh token's signature is still valid, let the page
    // load instead of forcing a logout — the client (AuthProvider) rotates
    // the access token itself via a normal browser fetch right after mount,
    // which is far more reliable than trying to do it here in middleware.
    // This one request goes through ungated (no x-user-id headers, so any
    // data API it calls will 401 once and the page handles that), but the
    // session itself — and the cookies — are left untouched.
    if (process.env.ROLE === 'customer') {
      const refreshToken = request.cookies.get('refresh_token')?.value
      const refreshPayload = refreshToken ? await verifyRefreshTokenSignature(refreshToken) : null
      if (refreshPayload?.userId) {
        return NextResponse.next()
      }
    }
    // No usable session at all — genuinely logged out. Clear cookies only if
    // there was actually an access token to invalidate; otherwise there's
    // nothing to clear.
    const loginUrl = new URL('/customer/auth/login', request.url)
    loginUrl.searchParams.set('returnTo', pathname)
    const response = NextResponse.redirect(loginUrl)
    if (accessToken) {
      response.cookies.delete('access_token')
      response.cookies.delete('refresh_token')
    }
    return response
  }

  if (needsVerification(pathname) && !(payload.phoneVerified || payload?.emailVerified)) {
    const verifyUrl = new URL('/customer/auth/verify', request.url)
    verifyUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(verifyUrl)
  }
 
  if (!hasRouteAccess(pathname)) {
    return NextResponse.redirect(new URL('/customer/dashboard', request.url))
  }
 
  // Add user info to request headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', payload.userId as string)
  requestHeaders.set('x-user-role', payload.role as string)
  requestHeaders.set('x-user-email', payload.email as string)
 
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}
 
// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}