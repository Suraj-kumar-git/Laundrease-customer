import { getApps, initializeApp, cert, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { query } from '@/lib/db'

let app: App | null = null

// FIREBASE_PRIVATE_KEY is stored with literal "\n" sequences (most env-var
// UIs, Render included, don't preserve real newlines) — swap them back in.
function getFirebaseApp(): App {
  if (app) return app
  if (getApps().length) {
    app = getApps()[0]
    return app
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials are not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)'
    )
  }

  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  return app
}

type SendPushParams = {
  userId: string | number
  title: string
  body: string
  /** FCM requires string values only — e.g. { orderId: '123' }. */
  data?: Record<string, string>
}

/**
 * Sends a push notification to every device registered for a user.
 * No-ops (logs and returns) if Firebase isn't configured yet or the user has
 * no registered devices, so callers don't need to guard for either case.
 */
export async function sendPushToUser({ userId, title, body, data }: SendPushParams): Promise<void> {
  let firebaseApp: App
  try {
    firebaseApp = getFirebaseApp()
  } catch (error) {
    console.error('[push] Firebase not configured:', error)
    return
  }

  const { rows } = await query<{ token: string }>(
    `SELECT token FROM device_tokens WHERE user_id = $1`,
    [userId]
  )
  if (!rows.length) return

  const tokens = rows.map((r) => r.token)

  const response = await getMessaging(firebaseApp).sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  })

  // Prune tokens Firebase reports as dead (app uninstalled, data cleared).
  const deadTokens = response.responses
    .map((r, i) => (!r.success && isUnregisteredError(r.error?.code) ? tokens[i] : null))
    .filter((t): t is string => t !== null)

  if (deadTokens.length) {
    await query(`DELETE FROM device_tokens WHERE token = ANY($1)`, [deadTokens])
  }
}

function isUnregisteredError(code?: string): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  )
}
