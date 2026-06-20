import crypto from "crypto"
import bcrypt from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

type RouteContext = {
  params: Promise<{ token: string }>
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function isExpired(expiresAt: string | Date) {
  return new Date(expiresAt).getTime() < Date.now()
}

async function findValidResetToken(tokenHash: string) {
  const result = await query(
    `SELECT
      prt.user_id,
      prt.token_hash,
      prt.expires_at,
      prt.used_at,
      u.email,
      u.role_id,
      r.name AS role
    FROM password_reset_tokens prt
    INNER JOIN users u ON u.id = prt.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE prt.token_hash = $1
      AND r.name = 'customer'
    LIMIT 1`,
    [tokenHash]
  )

  return result.rows[0] || null
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params

    if (!token || token.length < 32) {
      return NextResponse.json(
        { success: false, error: "Invalid reset link." },
        { status: 400 }
      )
    }

    const tokenHash = hashToken(token)
    const record = await findValidResetToken(tokenHash)

    if (!record) {
      return NextResponse.json(
        { success: false, error: "This reset link is invalid." },
        { status: 400 }
      )
    }

    if (record.used_at) {
      return NextResponse.json(
        { success: false, error: "This reset link has already been used." },
        { status: 400 }
      )
    }

    if (isExpired(record.expires_at)) {
      return NextResponse.json(
        { success: false, error: "This reset link has expired." },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Reset link is valid.",
    })
  } catch (error) {
    console.error("Reset token validation error:", error)
    return NextResponse.json(
      { success: false, error: "Unable to validate reset link." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params
    const body = await request.json()
    const password = body?.password?.trim()

    if (!token || token.length < 32) {
      return NextResponse.json(
        { success: false, error: "Invalid reset link." },
        { status: 400 }
      )
    }

    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password is required." },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      )
    }

    const tokenHash = hashToken(token)

    await query("BEGIN")

    try {
      const tokenResult = await query(
        `SELECT
          prt.user_id,
          prt.expires_at,
          prt.used_at,
          u.email,
          u.role_id,
          r.name AS role
        FROM password_reset_tokens prt
        INNER JOIN users u ON u.id = prt.user_id
        INNER JOIN roles r ON r.id = u.role_id
        WHERE prt.token_hash = $1
          AND r.name = 'customer'
        LIMIT 1
        FOR UPDATE`,
        [tokenHash]
      )

      const record = tokenResult.rows[0]

      if (!record) {
        await query("ROLLBACK")
        return NextResponse.json(
          { success: false, error: "This reset link is invalid." },
          { status: 400 }
        )
      }

      if (record.used_at) {
        await query("ROLLBACK")
        return NextResponse.json(
          { success: false, error: "This reset link has already been used." },
          { status: 400 }
        )
      }

      if (isExpired(record.expires_at)) {
        await query("ROLLBACK")
        return NextResponse.json(
          { success: false, error: "This reset link has expired." },
          { status: 400 }
        )
      }

      const passwordHash = await bcrypt.hash(password, 12)

      await query(
        `UPDATE users
         SET password_hash = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [record.user_id, passwordHash]
      )

      await query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1`,
        [record.user_id]
      )
      await query("COMMIT")
      return NextResponse.json({
        success: true,
        message: "Password has been reset successfully.",
      })
    } catch (error) {
      await query("ROLLBACK")
      throw error
    }
  } catch (error) {
    console.error("Reset password submit error:", error)
    return NextResponse.json(
      { success: false, error: "Unable to reset password." },
      { status: 500 }
    )
  }
}