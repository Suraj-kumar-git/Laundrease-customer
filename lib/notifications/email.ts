type Msg91Variables = Record<string, string>
const logoUrl = process.env.NEXT_PUBLIC_S3_LOGO_URL || 'https://laundrease-public.s3.ap-south-1.amazonaws.com/images/laundrease-logo.PNG';

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
  orderTrackingUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to,
    toName: params.customerName,
    templateId: getTemplateId('ORDER_UPDATE_EMAIL_TEMPLATE_ID'),
    variables: {
      toName: params.customerName,
      orderId: params.orderId,
      status: params.status,
      orderUrl: params.orderTrackingUrl,
      logoUrl: logoUrl
    },
  })
}

export async function sendTicketUpdateEmail(params: {
  to: string
  customerName: string
  ticketId: string
  updateMessage: string
  ticketSubject: string
  ticketStatus: string
  ticketUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to,
    toName: params.customerName,
    templateId: getTemplateId('SUPPORT_TICKET_UPDATE_EMAIL_TEMPLATE_ID'),
    variables: {
      toName: params.customerName,
      ticketId: params.ticketId,
      ticketSubject: params.ticketSubject, // new
      ticketStatus: params.ticketStatus,   // new
      updateMessage: params.updateMessage,
      ticketUrl: params.ticketUrl,         // new
      supportEmail: 'support@laundrease.in', // new (constant)
      logoUrl: logoUrl              // footer logo
    },
  })
}
export async function sendDeliveryCompletionLinkEmail(to: string, name: string, completionLink: string): Promise<void> {
  await sendMsg91TemplateEmail({
    to: to,
    toName: name,
    templateId: getTemplateId('DELIVERY_COMPLETION_LINK_TEMPLATE_ID'),
    variables: {
      name: name,
      completionLink: completionLink,
      validity_hours: '72',
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendPasswordResetEmail(to: string, customerName: string, resetLink: string): Promise<void> {
  await sendMsg91TemplateEmail({
    to: to,
    toName: customerName,
    templateId: getTemplateId('PASSWORD_RESET_EMAIL_TEMPLATE_ID'),
    variables: {
      toEmail: to,
      toName: customerName,
      resetLink: resetLink,
      logoUrl: logoUrl
    },
  })
}

// ─── Order lifecycle emails ──────────────────────────────────────────────────
// Each event gets its own MSG91 template env so the templates can be crafted

export async function sendOrderConfirmedEmail(params: {
  to: string; customerName: string; orderNumber: string; pickupDate?: string | null; orderUrl: string;
  pickupSlot?: string | null
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_CONFIRMED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      pickupDate:   params.pickupDate || 'to be scheduled',
      pickupSlot: params.pickupSlot || 'to be scheduled',
      status: 'Confirmed',           // or params.status
      orderUrl: params.orderUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendOrderCancelledEmail(params: {
  to: string; customerName: string; orderNumber: string
  cancelledBy: 'customer' | 'delivery_partner' | 'platform'
  // Overrides the mapped phrase when the caller has a more specific message
  // (e.g. "by Laundrease — pickup could not be completed after 3 attempts").
  cancelledByText?: string
  refundNote?: string; orderUrl: string;
}): Promise<void> {
  const cancelledByText = params.cancelledByText || (
    params.cancelledBy === 'customer'         ? 'at your request'
    : params.cancelledBy === 'delivery_partner' ? 'by the delivery partner at your request'
    : 'by Laundrease')
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_CANCELLED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      status: 'Cancelled',
      orderUrl: params.orderUrl,
      cancelledBy:  cancelledByText,
      refundNote:   params.refundNote || 'No payment was captured for this order.',
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

// Sent when the laundry provider rejects a brand-new ('pending') order
// instead of confirming it — includes the provider's reason and nudges the
// customer to place a new order.
export async function sendOrderNotConfirmedEmail(params: {
  to: string; customerName: string; orderNumber: string; reason: string; refundNote?: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_NOT_CONFIRMED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      status: 'Rejected',
      rejectionReason:       params.reason,
      refundNote:   params.refundNote || 'No payment was captured for this order.',
      orderUrl: params.orderUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendOrderDeliveredEmail(params: {
  to: string; customerName: string; orderNumber: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_DELIVERED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      status: 'Delivered',           // or params.status
      orderUrl: params.orderUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendOrderItemsModifiedEmail(params: {
  to: string; customerName: string; orderNumber: string; changesSummary: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('ORDER_ITEMS_MODIFIED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName:   params.customerName,
      orderNumber:    params.orderNumber,
      status: 'Out For Pickup',         // e.g., In Progress, Updated
      changesSummary: params.changesSummary, // plain text, can include new lines
      orderUrl: params.orderUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

// ─── Partner / admin emails ──────────────────────────────────────────────────

export async function sendProviderNewOrderEmail(params: {
  to: string; providerName: string; orderNumber: string; pickupDate?: string | null;
  pickupSlot?: string | null; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.providerName,
    templateId: getTemplateId('PROVIDER_NEW_ORDER_EMAIL_TEMPLATE_ID'),
    variables: {
      providerName: params.providerName,
      orderNumber:  params.orderNumber,
      pickupDate:   params.pickupDate || 'to be scheduled',
      pickupSlot: params.pickupSlot || 'to be scheduled',
      orderUrl: params.orderUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendProviderOrderCancelledEmail(params: {
  to: string; providerName: string; orderNumber: string; cancelledBy: string;
  cancellationReason: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.providerName,
    templateId: getTemplateId('PROVIDER_ORDER_CANCELLED_EMAIL_TEMPLATE_ID'),
    variables: {
      providerName: params.providerName,
      orderNumber:  params.orderNumber,
      cancelledBy:  params.cancelledBy,
      cancellationReason: params.cancellationReason,
      orderUrl: params.orderUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendPartnerAccountActivatedEmail(params: {
  to: string; name: string; loginUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('DELIVERY_ACTIVATED_EMAIL_TEMPLATE_ID'),
    variables: { 
      deliveryName: params.name,
      deliveryEmail: params.to,
      loginUrl: params.loginUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    }
  })
}

export async function sendProviderAccountActivatedEmail(params: {
  to: string; name: string; loginUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('LAUNDRY_ACTIVATED_EMAIL_TEMPLATE_ID'),
    variables: {
      providerName: params.name,
      providerEmail: params.to,
      loginUrl: params.loginUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    }
  })
}

export async function sendProviderDocRejectedEmail(params: {
  to: string; name: string; docLabel: string; reason: string;
  statusPageUrl: string;
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('LAUNDRY_DOC_REJECTED_EMAIL_TEMPLATE_ID'),
    variables: {
      providerName: params.name,
      documentName: params.docLabel,
      rejectionReason: params.reason,
      statusPageUrl: params.statusPageUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    }
  })
}

export async function sendProviderCompletionLinkEmail(to: string, name: string, completionLink: string): Promise<void> {
  await sendMsg91TemplateEmail({
    to: to,
    toName: name,
    templateId: getTemplateId('LAUNDRY_COMPLETION_LINK_TEMPLATE_ID'),
    variables: {
      name: name,
      completionLink: completionLink,
      validity_hours: '72',
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    },
  })
}

export async function sendPartnerDocRejectedEmail(params: {
  to: string; name: string; docLabel: string; reason: string;
  statusPageUrl: string;
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('DELIVERY_DOC_REJECTED_EMAIL_TEMPLATE_ID'),
    variables: {
      deliveryName: params.name,
      documentName: params.docLabel,
      rejectionReason: params.reason,
      statusPageUrl: params.statusPageUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    }
  })
}

export async function sendAdminNewRegistrationEmail(params: {
  to: string; adminName: string; partnerType: 'laundry' | 'delivery'; partnerName: string;
  reviewUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.adminName,
    templateId: getTemplateId('ADMIN_NEW_REGISTRATION_EMAIL_TEMPLATE_ID'),
    variables: {
      adminName:   params.adminName,
      partnerType: params.partnerType === 'laundry' ? 'Laundry provider' : 'Delivery partner',
      partnerName: params.partnerName,
      reviewUrl: params.reviewUrl,
      logoUrl: logoUrl
    },
  })
}

// Sent when an already-active provider requests a GSTIN update (new number +
// re-uploaded certificate) — distinct from the initial-registration email
// above since it needs its own MSG91 template with different copy.
export async function sendAdminGstUpdateRequestEmail(params: {
  to: string; adminName: string; partnerName: string; gstNumber: string; reviewUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.adminName,
    templateId: getTemplateId('ADMIN_GST_UPDATE_REQUEST_EMAIL_TEMPLATE_ID'),
    variables: {
      adminName:  params.adminName,
      partnerName: params.partnerName,
      gstNumber:   params.gstNumber,
      reviewUrl:   params.reviewUrl,
      logoUrl:     logoUrl,
    },
  })
}

export async function sendPayoutProcessedEmail(params: {
  to: string; name: string; amount: string; periodLabel: string;
  memberType: string; payoutDate: string; payslipUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.name,
    templateId: getTemplateId('PAYOUT_PROCESSED_EMAIL_TEMPLATE_ID'),
    variables: {
      partnerName: params.name,
      memberType: params.memberType,
      periodLabel: params.periodLabel,
      amount: params.amount,
      payoutDate: params.payoutDate,
      payslipUrl: params.payslipUrl,
      logoUrl: logoUrl,
      supportEmail: 'support@laundrease.in'
    }
  })
}

// ─── Item-protection claim emails ────────────────────────────────────────────

export async function sendClaimSubmittedEmail(params: {
  to: string; customerName: string; orderNumber: string
  itemLabel: string; claimType: string; claimId: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('CLAIM_SUBMITTED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      itemLabel:    params.itemLabel,
      claimType:    params.claimType,
      claimId: params.claimId,
      orderUrl: params.orderUrl,
      supportEmail: 'support@laundrease.in',
      logoUrl: logoUrl
    },
  })
}

export async function sendClaimProviderDecisionEmail(params: {
  to: string; customerName: string; orderNumber: string
  itemLabel: string; approved: boolean; providerComment: string;
  claimId: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('CLAIM_PROVIDER_DECISION_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName:    params.customerName,
      orderNumber:     params.orderNumber,
      itemLabel:       params.itemLabel,
      decision:        params.approved ? 'approved' : 'rejected',
      providerComment: params.providerComment,
      nextStep:        params.approved
        ? 'Our team is now determining your compensation amount — we will keep you posted.'
        : 'This decision is final. If you believe it is incorrect, please contact our support team.',
      claimId: params.claimId,
      orderUrl: params.orderUrl,
      supportEmail: 'support@laundrease.in',
      logoUrl: logoUrl
    },
  })
}

export async function sendClaimResolvedEmail(params: {
  to: string; customerName: string; orderNumber: string
  itemLabel: string; amount: string; claimId: string; orderUrl: string
}): Promise<void> {
  await sendMsg91TemplateEmail({
    to: params.to, toName: params.customerName,
    templateId: getTemplateId('CLAIM_RESOLVED_EMAIL_TEMPLATE_ID'),
    variables: {
      customerName: params.customerName,
      orderNumber:  params.orderNumber,
      itemLabel:    params.itemLabel,
      amount:       params.amount,
      claimId: params.claimId,
      orderUrl: params.orderUrl,
      supportEmail: 'support@laundrease.in',
      logoUrl: logoUrl
    },
  })
}
