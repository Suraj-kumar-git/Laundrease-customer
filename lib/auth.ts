import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'
import { queryOne } from '@/lib/db'
 
// ============================================
// PASSWORD UTILITIES
// ============================================
 
/**
* Hash a password using bcrypt
*/
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10
  return await bcrypt.hash(password, saltRounds)
}
 
/**
* Verify a password against a hash
*/
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}
 
/**
* Validate password strength
*/
export function validatePassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
 
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long')
  }
 
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
 
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
 
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
 
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }
 
  return {
    valid: errors.length === 0,
    errors,
  }
}
 
// ============================================
// JWT TOKEN UTILITIES
// ============================================
 
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
)
 
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY
 
/**
* Generate access token (short-lived)
*/
export async function generateAccessToken(payload: {
    userId:        string
    email:         string
    role:          string
    sessionId:     string
    emailVerified: boolean
    phoneVerified: boolean
}): Promise<string> {
  return await new SignJWT({
    userId:        payload.userId,
    email:         payload.email,
    role:          payload.role,
    sessionId:     payload.sessionId,
    emailVerified: payload.emailVerified,
    phoneVerified: payload.phoneVerified,
    type:          'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY || '7d')
    .sign(JWT_SECRET)
}
 
/**
* Generate refresh token (long-lived)
*/
export async function generateRefreshToken(
  userId: string,
  sessionId: string,
  refreshTokenExpiry: string
): Promise<string> {
  return await new SignJWT({
    userId,
    sessionId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(refreshTokenExpiry || (REFRESH_TOKEN_EXPIRY || '7d'))
    .sign(JWT_SECRET)
}
 
/**
* Verify access token
*/
export async function verifyAccessToken(token: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    })
 
    if (payload.type !== 'access') {
      throw new Error('Invalid token type')
    }
 
    return payload
  } catch (error) {
    return null
  }
}
 
/**
* Verify refresh token
*/
export async function verifyRefreshToken(token: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    })
 
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type')
    }
 
    return payload
  } catch (error) {
    return null
  }
}
 
// ============================================
// COOKIE UTILITIES
// ============================================
function durationToSeconds(input?: string | number, defaultDays = 7): number {
  if (input == null) return defaultDays * 24 * 60 * 60;
  if (typeof input === 'number') {
    // treat plain number as days (change if you prefer seconds)
    return Math.floor(input * 24 * 60 * 60);
  }

  const v = input.trim().toLowerCase();
  const m = v.match(/^(\d+)(s|m|h|d)?$/);
  if (!m) {
    throw new Error(`Invalid duration format: "${input}". Use number or suffix s/m/h/d.`);
  }

  const value = parseInt(m[1], 10);
  const unit = m[2] ?? 'd'; // default to days when no suffix

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: throw new Error(`Unsupported unit: ${unit}`);
  }
}
 
/**
* Set authentication cookies (httpOnly, secure, sameSite)
*/
export async function setAuthCookies(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const cookieStore = await cookies()

  const isProduction = process.env.NODE_ENV === 'production'
  const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '7d';
  const maxAgeSeconds = durationToSeconds(ACCESS_TOKEN_EXPIRY);

  cookieStore.set('access_token', accessToken, {
    httpOnly: true,        // note: httpOnly cannot be set from client-side JS
    secure: isProduction,
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
    path: '/',
  });
 
  cookieStore.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  })
}
 
/**
* Clear authentication cookies
*/
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('access_token')
  cookieStore.delete('refresh_token')
}
 
// ============================================
// SESSION UTILITIES
// ============================================
 
/**
* Generate a unique session ID
*/
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex')
}
 
// ============================================
// OTP UTILITIES
// ============================================
 
/**
* Generate a numeric OTP code
*/
export function generateOTP(length: number = 6): string {
  const digits = '0123456789'
  let otp = ''
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)]
  }
  
  return otp
}
 
// ============================================
// RATE LIMITING
// ============================================
 
// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number; sessionStart: number }>()
 
/**
* Check rate limit for a given key (typically IP address)
*/
export function checkRateLimit(
  key: string,
  options: {
    maxRequests: number
    windowMs: number
    sessionDurationMs: number
  }
): {
  allowed: boolean
  remaining: number
  resetAt: number
  sessionValid: boolean
} {
  const now = Date.now()
  const record = rateLimitStore.get(key)
 
  // No existing record or session expired
  if (!record || now > record.sessionStart + options.sessionDurationMs) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
      sessionStart: now,
    })
    
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: now + options.windowMs,
      sessionValid: true,
    }
  }
 
  // Window expired, reset counter
  if (now > record.resetAt) {
    record.count = 1
    record.resetAt = now + options.windowMs
    rateLimitStore.set(key, record)
    
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: record.resetAt,
      sessionValid: true,
    }
  }
 
  // Within window, check limit
  if (record.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      sessionValid: now <= record.sessionStart + options.sessionDurationMs,
    }
  }
 
  // Increment counter
  record.count++
  rateLimitStore.set(key, record)
 
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    resetAt: record.resetAt,
    sessionValid: true,
  }
}
 
/**
* Clear rate limit for a key
*/
export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key)
}
 
// ============================================
// REQUEST UTILITIES
// ============================================
 
/**
* Get client IP address from request
*/
export function getClientIP(req: NextRequest): string {
  // Check forwarded headers (common in production behind proxies/load balancers)
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim()
  }
  // Check real IP header (Cloudflare, Nginx)
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  // Check CF-Connecting-IP (Cloudflare specific)
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) {
    return cfIp.trim()
  }
  // Check True-Client-IP (Akamai, Cloudflare)
  const trueClientIp = req.headers.get('true-client-ip')
  if (trueClientIp) {
    return trueClientIp.trim()
  }
  // Fallback to localhost (development)
  return '127.0.0.1'
}
 
export interface AuthUser {
  id: string
  email: string
  role: string
  full_name: string
  email_verified: boolean
  phone_verified: boolean
}
 
/**
* Get authenticated user from JWT token in cookies
* Use this in API routes to get the current user
*/
export async function getAuthUser(req?: NextRequest): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('access_token')?.value
    
    if (!accessToken) {
      return null
    }
    
    // Verify JWT token using existing verifyAccessToken
    const decoded = await verifyAccessToken(accessToken)
    
    if (!decoded?.userId) {
      return null
    }
    
    // Return user info from token
    return {
      id:             decoded.userId,
      email:          decoded.email,
      role:           decoded.role,
      full_name:      '',
      email_verified: decoded.emailVerified ?? false,
      phone_verified: decoded.phoneVerified ?? false,
    }
  } catch (error) {
    console.error('Get auth user error:', error)
    return null
  }
}
 
/**
* Get user ID from authenticated session
* Throws error if user is not authenticated
*/
export async function requireAuth(req?: NextRequest): Promise<string> {
  const user = await getAuthUser(req)
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  return user.id
}
 
/**
* Get user ID and verify role
* Throws error if user is not authenticated or doesn't have required role
*/
export async function requireRole(requiredRole: string | string[], req?: NextRequest): Promise<string> {
  const user = await getAuthUser(req)
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  
  if (!roles.includes(user.role)) {
    throw new Error('Forbidden: Insufficient permissions')
  }
  
  return user.id
}