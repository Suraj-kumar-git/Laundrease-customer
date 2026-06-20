// lib/sqs.ts
// AWS SQS client for enqueuing async tasks (order confirmation emails, etc.)
// Messages are processed by a separate consumer (Lambda or worker).

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

function getSqsClient(): SQSClient {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS credentials for SQS')
  }

  return new SQSClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(process.env.AWS_SQS_ENDPOINT
      ? { endpoint: process.env.AWS_SQS_ENDPOINT } // For LocalStack dev
      : {}),
  })
}

const QUEUE_URL = process.env.AWS_SQS_ORDER_QUEUE_URL

export type SqsMessageType =
  | 'ORDER_CONFIRMATION_EMAIL'
  | 'ORDER_STATUS_UPDATE_EMAIL'
  | 'REFERRAL_REWARD_EMAIL'

export interface SqsMessage {
  type: SqsMessageType
  payload: Record<string, any>
  timestamp: string
}

/**
 * Enqueue a message to the SQS queue.
 * Non-throwing — logs errors but never fails the calling request.
 */
export async function enqueueMessage(
  type: SqsMessageType,
  payload: Record<string, any>
): Promise<void> {
  if (!QUEUE_URL) {
    // Dev mode: just log the message
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SQS:DEV] Would enqueue ${type}:`, JSON.stringify(payload, null, 2))
    }
    return
  }

  try {
    const client = getSqsClient()
    const message: SqsMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    }

    await client.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          MessageType: {
            DataType: 'String',
            StringValue: type,
          },
        },
      })
    )
  } catch (error) {
    // Non-fatal: email failure should never fail order creation
    console.error(`[SQS] Failed to enqueue ${type}:`, error)
  }
}

/**
 * Enqueue an order confirmation email.
 * Called after successful order creation.
 */
export async function enqueueOrderConfirmationEmail(params: {
  orderId: number
  orderNumber: string
  customerEmail: string
  customerName: string
  totalAmount: number
  pickupDate: string
  pickupTimeSlot: string
  providerName: string
  paymentMethod: string
}): Promise<void> {
  await enqueueMessage('ORDER_CONFIRMATION_EMAIL', params)
}
