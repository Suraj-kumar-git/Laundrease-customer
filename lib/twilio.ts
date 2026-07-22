import { Twilio } from 'twilio';
import { normalizeIndianPhone } from './notifications/sms';
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    throw new Error('Missing Twilio credentials: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN')
  }
  return new Twilio(accountSid, authToken)
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const to = normalizeIndianPhone(phone)
  if (process.env.NODE_ENV === 'development') {
    console.log(`
      ========================================
      [TWILIO DEV] SMS OTP
      PHONE : ${to}
      OTP   : ${otp}
      ========================================
    `)
    return
  }
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
  if (!fromNumber) {
    throw new Error('Missing TWILIO_PHONE_NUMBER env var')
  }
  const client = getTwilioClient()
  await client.messages.create({
    body: `Your Laundrease verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    from: fromNumber,
    to: to,
  })
}