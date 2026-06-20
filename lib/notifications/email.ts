type EmailProvider = 'mock' | 'msg91'
type Msg91Variables = Record<string, string>

function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER
  if (provider === 'mock' || provider === 'msg91') {
    return provider
  }
  return process.env.NODE_ENV === 'development' ? 'mock' : 'msg91'
}

function getMsg91Config() {
  const authKey = process.env.MSG91_AUTH_KEY
  const domain = process.env.MSG91_EMAIL_DOMAIN
  const fromEmail = process.env.MSG91_NO_REPLY_EMAIL
  const fromName = process.env.MSG91_FROM_NAME || 'Laundrease'
  if (!authKey) throw new Error('Missing MSG91_AUTH_KEY')
  if (!domain) throw new Error('Missing MSG91_EMAIL_DOMAIN')
  if (!fromEmail) throw new Error('Missing MSG91_NO_REPLY_EMAIL')
  return {authKey, domain, fromEmail, fromName}
}

function getTemplateId(envKey: string) {
  const value = process.env[envKey]
  if (!value) throw new Error(`Missing ${envKey}`);
  return value
}

async function sendMsg91TemplateEmail(params: {
  to: string
  toName?: string
  templateId: string
  variables: Msg91Variables
}): Promise<void> {
  const { authKey, domain, fromEmail, fromName } = getMsg91Config()
  const response = await fetch('https://control.msg91.com/api/v5/email/send',{
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authkey: authKey,
    },
    body: JSON.stringify({
      recipients: [
        {
          to: [
            {
              name: params.toName || params.to,
              email: params.to,
            },
          ],
          variables: params.variables,
        },
      ],
      from: {
        name: fromName,
        email: fromEmail,
      },
      domain,
      template_id: params.templateId,
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`MSG91 email failed with status ${response.status}: ${JSON.stringify(data)}`);
}

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const provider = getEmailProvider()
  if (provider === 'mock') {
    console.log(`
      ========================================
      [EMAIL DEV] OTP EMAIL
      TO    : ${email}
      OTP   : ${otp}
      ========================================
    `)
    return
  }
  await sendMsg91TemplateEmail({
    to: email,
    toName: email,
    templateId: getTemplateId('OTP_EMAIL_TEMPLATE_ID'),
    variables: {
      otp,
      // validity_minutes: '10',
      company_name: 'Laundrease',
    },
  })
}

export async function sendOrderUpdateEmail(params: {
  to: string
  customerName: string
  orderId: string
  status: string
}): Promise<void> {
  const provider = getEmailProvider()
  if (provider === 'mock') {
    console.log(`
      ========================================
      [EMAIL DEV] ORDER UPDATE
      TO      : ${params.to}
      ORDER ID: ${params.orderId}
      STATUS  : ${params.status}
      ========================================
    `)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to,
    toName: params.customerName,
    templateId: getTemplateId('CREATE_ORDER_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderId: params.orderId,
      status: params.status,
    },
  })
}

export async function sendTicketUpdateEmail(params: {
  to: string
  customerName: string
  ticketId: string
  updateMessage: string
}): Promise<void> {
  const provider = getEmailProvider()

  if (provider === 'mock') {
    console.log(`
      ========================================
      [EMAIL DEV] TICKET UPDATE
      TO       : ${params.to}
      TICKET ID: ${params.ticketId}
      MESSAGE  : ${params.updateMessage}
      ========================================
    `)
    return
  }

  await sendMsg91TemplateEmail({
    to: params.to,
    toName: params.customerName,
    templateId: getTemplateId('SUPPORT_TICKET_UPDATE_EMAIL_TEMPATE_ID'),
    variables: {
      customerName: params.customerName,
      ticketId: params.ticketId,
      updateMessage: params.updateMessage,
    },
  })
}
export async function sendPasswordResetEmail(to: string, customerName: string, resetLink: string): Promise<void> {
  const provider = getEmailProvider()
  if (provider === 'mock') {
    console.log(`
      ========================================
      [EMAIL DEV] PASSWORD RESET LINK
      TO       : ${to}
      TICKET ID: ${customerName}
      MESSAGE  : ${resetLink}
      ========================================
    `)
    return
  }

  await sendMsg91TemplateEmail({
    to: to,
    toName: customerName,
    templateId: getTemplateId('PASSWORD_RESET_EMAIL_TEMPATE_ID'),
    variables: {
      customerName: customerName,
      resetLink: resetLink,
    },
  })
}