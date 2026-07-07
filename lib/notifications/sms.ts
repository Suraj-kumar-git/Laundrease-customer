type SmsProvider = 'mock' | 'msg91';

// ***** TODO: Once we get the DLT template ID will check the usage of the below method else remove it *****
// function normalizeIndianPhoneForMsg91(raw: string): string {
//   const digits = raw.replace(/\D/g, '')
//   if (digits.length === 10) {
//     return `91${digits}`
//   }
//   if ((digits.length === 12 && digits.startsWith('91')) || (raw.startsWith('+') && digits.length >= 10)) {
//     return digits
//   }
//   throw new Error('Invalid phone number format. Enter a 10-digit Indian mobile number.')
// }

export async function sendOtpSms(phone: string, otp: string, template:string): Promise<void> {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase() as SmsProvider
  const to = normalizeIndianPhone(phone)
  if (provider === 'mock' || process.env.NODE_ENV === 'development') {
    console.log(`
      ========================================
      [SMS DEV] OTP SMS (${provider})
      PHONE : ${to}
      OTP   : ${otp}
      ========================================
    `)
    return
  }
  let template_id;
  if(template === 'registration') {
    template_id = process.env.SIGNUP_SMS_TEMPLATE_ID;
  } else if(template === 'signin') {
    template_id = process.env.SIGNIN_SMS_TEMPLATE_ID
  }
  const payload = {
    template_id: template_id,
    short_url: "0",
    recipients: [
      {
        mobiles: to,
        var1: otp,
      },
    ],
  };
  const response = await fetch('https://control.msg91.com/api/v5/flow',{
    method: 'POST',
    headers: {
      accept: 'application/json',
      authkey: process.env.MSG91_AUTH_KEY || '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || data?.status === 'fail' || data?.hasError) {
    throw new Error('Failed to send message: ',data);
  } 
}

// Sent when the delivery partner heads out to collect the order from the
// customer (first leg). Same mock/dev-stub vs. MSG91-template pattern as
// sendOutForDeliverySms — fire-and-forget, never block the status update.
export async function sendOutForPickupSms(phone: string, orderNumber: string): Promise<void> {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase() as SmsProvider
  const to = normalizeIndianPhone(phone)
  if (provider === 'mock' || process.env.NODE_ENV === 'development') {
    console.log(`
      ========================================
      [SMS DEV] Out-for-pickup SMS (${provider})
      PHONE : ${to}
      ORDER : ${orderNumber}
      ========================================
    `)
    return
  }
  const template_id = process.env.OUT_FOR_PICKUP_SMS_TEMPLATE_ID
  const payload = {
    template_id,
    short_url: '0',
    recipients: [{ mobiles: to, var1: orderNumber }],
  }
  const response = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authkey: process.env.MSG91_AUTH_KEY || '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok || data?.status === 'fail' || data?.hasError) {
    throw new Error(`Failed to send out-for-pickup SMS: ${JSON.stringify(data)}`)
  }
}

// Fire-and-forget notification sent when a delivery partner picks an order
// up from the laundry and starts the delivery leg. Mirrors sendOtpSms's
// mock/dev-stub vs. MSG91-template pattern — callers should not await this
// inline with the status-update transaction; wrap in its own try/catch so a
// notification failure never blocks the order status change.
export async function sendOutForDeliverySms(phone: string, orderNumber: string): Promise<void> {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase() as SmsProvider
  const to = normalizeIndianPhone(phone)
  if (provider === 'mock' || process.env.NODE_ENV === 'development') {
    console.log(`
      ========================================
      [SMS DEV] Out-for-delivery SMS (${provider})
      PHONE : ${to}
      ORDER : ${orderNumber}
      ========================================
    `)
    return
  }
  const template_id = process.env.OUT_FOR_DELIVERY_SMS_TEMPLATE_ID
  const payload = {
    template_id,
    short_url: '0',
    recipients: [{ mobiles: to, var1: orderNumber }],
  }
  const response = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authkey: process.env.MSG91_AUTH_KEY || '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok || data?.status === 'fail' || data?.hasError) {
    throw new Error(`Failed to send out-for-delivery SMS: ${JSON.stringify(data)}`)
  }
}

export function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+91${digits}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`
  }
  if (raw.startsWith('+') && digits.length >= 10) {
    return `+${digits}`
  }
  throw new Error('Invalid phone number format. Enter a 10-digit Indian mobile number.')
}