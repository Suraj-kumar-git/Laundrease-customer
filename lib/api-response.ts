import { NextResponse } from 'next/server'

/**
 * Standard API response format
 */
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
  meta?: Record<string, any>
  timestamp: string
}

/**
 * Create a successful API response
 */
export function successResponse<T = any>(
  data: T,
  status: number = 200,
  meta?: Record<string, any>
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta,
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}

/**
 * Create an error API response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  code?: string,
  meta?: Record<string, any>
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      meta,
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}

/**
 * Create a validation error response
 */
export function validationError(
  errors: Record<string, string[] | string>,
  message: string = 'Validation failed'
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: 'VALIDATION_ERROR',
      meta: { errors },
      timestamp: new Date().toISOString(),
    },
    { status: 422 }
  )
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(
  message: string = 'Unauthorized'
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    },
    { status: 401 }
  )
}

/**
 * Create a forbidden response
 */
export function forbiddenResponse(
  message: string = 'Forbidden'
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: 'FORBIDDEN',
      timestamp: new Date().toISOString(),
    },
    { status: 403 }
  )
}

/**
 * Create a not found response
 */
export function notFoundResponse(
  message: string = 'Resource not found'
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: 'NOT_FOUND',
      timestamp: new Date().toISOString(),
    },
    { status: 404 }
  )
}

/**
 * Create a server error response
 */
export function serverErrorResponse(
  message: string = 'Internal server error',
  meta?: Record<string, any>
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: 'INTERNAL_ERROR',
      meta,
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  )
}