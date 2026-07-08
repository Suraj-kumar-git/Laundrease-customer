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
    templateId: getTemplateId('SUPPORT_TICKET_UPDATE_EMAIL_TEMPLATE_ID'),
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
    templateId: getTemplateId('PASSWORD_RESET_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: customerName,
      resetLink: resetLink,
    },
  })
}

// ─── Order lifecycle emails ──────────────────────────────────────────────────
// Each event gets its own MSG91 template env so the templates can be crafted
// independently. All follow the same mock/dev pattern as sendOtpEmail.

export async function sendOrderConfirmedEmail(params: {
  to: string; customerName: string; orderNumber: string; pickupDate?: string | null
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] ORDER CONFIRMED → ${params.to} | order ${params.orderNumber} | pickup ${params.pickupDate || 'TBD'}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_CONFIRMED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      pickupDate:   params.pickupDate || 'to be scheduled',
    },
  })
}

export async function sendOrderCancelledEmail(params: {
  to: string; customerName: string; orderNumber: string
  cancelledBy: 'customer' | 'delivery_partner' | 'platform'
  refundNote?: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] ORDER CANCELLED → ${params.to} | order ${params.orderNumber} | by ${params.cancelledBy} | ${params.refundNote || ''}`)
    return
  }
  const cancelledByText =
    params.cancelledBy === 'customer'         ? 'at your request'
    : params.cancelledBy === 'delivery_partner' ? 'by the delivery partner at your request'
    : 'by Laundrease'
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_CANCELLED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      cancelledBy:  cancelledByText,
      refundNote:   params.refundNote || 'No payment was captured for this order.',
    },
  })
}

// NOTE: no code path emits this yet — it needs either a scheduled job that
// detects orders stuck in 'pending' or an explicit admin "cancel unconfirmed
// order" action. The helper is ready for whichever trigger gets built.
export async function sendOrderNotConfirmedEmail(params: {
  to: string; customerName: string; orderNumber: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] ORDER NOT CONFIRMED → ${params.to} | order ${params.orderNumber}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_NOT_CONFIRMED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
    },
  })
}

export async function sendOrderDeliveredEmail(params: {
  to: string; customerName: string; orderNumber: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] ORDER DELIVERED → ${params.to} | order ${params.orderNumber}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_DELIVERED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
    },
  })
}

export async function sendOrderItemsModifiedEmail(params: {
  to: string; customerName: string; orderNumber: string; changesSummary: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] ORDER ITEMS MODIFIED → ${params.to} | order ${params.orderNumber} | ${params.changesSummary}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_ITEMS_MODIFIED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName:   params.customerName,
      orderNumber:    params.orderNumber,
      changesSummary: params.changesSummary,
    },
  })
}

// ─── Partner / admin emails ──────────────────────────────────────────────────

export async function sendProviderNewOrderEmail(params: {
  to: string; providerName: string; orderNumber: string; pickupDate?: string | null
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] PROVIDER NEW ORDER → ${params.to} | order ${params.orderNumber} | pickup ${params.pickupDate || 'TBD'}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.providerName,
    templateId: getTemplateId('PROVIDER_NEW_ORDER_EMAIL_TEMPLATE_ID'),
    variables: {
      providerName: params.providerName,
      orderNumber:  params.orderNumber,
      pickupDate:   params.pickupDate || 'to be scheduled',
    },
  })
}

export async function sendProviderOrderCancelledEmail(params: {
  to: string; providerName: string; orderNumber: string; cancelledBy: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] PROVIDER ORDER CANCELLED → ${params.to} | order ${params.orderNumber} | by ${params.cancelledBy}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.providerName,
    templateId: getTemplateId('PROVIDER_ORDER_CANCELLED_EMAIL_TEMPLATE_ID'),
    variables: {
      providerName: params.providerName,
      orderNumber:  params.orderNumber,
      cancelledBy:  params.cancelledBy,
    },
  })
}

export async function sendPartnerAccountActivatedEmail(params: {
  to: string; name: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] DELIVERY ACCOUNT ACTIVATED → ${params.to}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('DELIVERY_ACTIVATED_EMAIL_TEMPLATE_ID'),
    variables: { name: params.name },
  })
}

export async function sendPartnerDocRejectedEmail(params: {
  to: string; name: string; docLabel: string; reason: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] DELIVERY DOC REJECTED → ${params.to} | ${params.docLabel} | ${params.reason}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('DELIVERY_DOC_REJECTED_EMAIL_TEMPLATE_ID'),
    variables: {
      name:     params.name,
      docLabel: params.docLabel,
      reason:   params.reason,
    },
  })
}

export async function sendAdminNewRegistrationEmail(params: {
  to: string; adminName: string; partnerType: 'laundry' | 'delivery'; partnerName: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] ADMIN NEW REGISTRATION → ${params.to} | ${params.partnerType}: ${params.partnerName}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.adminName,
    templateId: getTemplateId('ADMIN_NEW_REGISTRATION_EMAIL_TEMPLATE_ID'),
    variables: {
      adminName:   params.adminName,
      partnerType: params.partnerType === 'laundry' ? 'Laundry provider' : 'Delivery partner',
      partnerName: params.partnerName,
    },
  })
}

export async function sendPayoutProcessedEmail(params: {
  to: string; name: string; amount: string; periodLabel: string
}): Promise<void> {
  if (getEmailProvider() === 'mock') {
    console.log(`[EMAIL DEV] PAYOUT PROCESSED → ${params.to} | ₹${params.amount} | ${params.periodLabel}`)
    return
  }
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('PAYOUT_PROCESSED_EMAIL_TEMPLATE_ID'),
    variables: {
      name:        params.name,
      amount:      params.amount,
      periodLabel: params.periodLabel,
    },
  })
}

export async function sendDeliveryCompletionLinkEmail(to: string, name: string, completionLink: string): Promise<void> {
  const provider = getEmailProvider()
  if (provider === 'mock') {
    console.log(`
      ========================================
      [EMAIL DEV] DELIVERY PROFILE COMPLETION LINK
      TO      : ${to}
      NAME    : ${name}
      LINK    : ${completionLink}
      ========================================
    `)
    return
  }

  await sendMsg91TemplateEmail({
    to: to,
    toName: name,
    templateId: getTemplateId('DELIVERY_COMPLETION_LINK_TEMPLATE_ID'),
    variables: {
      name: name,
      completionLink: completionLink,
      validity_hours: '72',
    },
  })
}