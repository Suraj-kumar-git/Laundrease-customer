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
 
  // Handle API routes
  if (pathname.startsWith('/api')) {
    // Allow public API routes
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next()
    }
    // For protected API routes, verify token
    const accessToken = request.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Please login' },
        { status: 401 }
      )
    }
    const payload = await verifyToken(accessToken)
    if (!payload || !payload.userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
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
    if (isAuthPage(pathname)) {
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
 
  // If no token, redirect to login page
  if (!accessToken) {
    const loginUrl = new URL('/customer/auth/login', request.url)
    loginUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(loginUrl)
  }
 
  // Verify token
  const payload = await verifyToken(accessToken)
 
  if (!payload || !payload.userId || !payload.role) {
    const loginUrl = new URL('/customer/auth/login', request.url)
    loginUrl.searchParams.set('returnTo', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
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