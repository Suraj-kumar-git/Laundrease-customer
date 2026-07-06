type Msg91Variables = Record<string, string>

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

export async function sendSMSOtpOnEmail(email: string, otp: string): Promise<void> {
  await sendMsg91TemplateEmail({
    to: email,
    toName: email,
    // 'SMS_OTP_ON_EMAIL_TEMPLATE_ID' = ,
    templateId: 'sms_otp_on_email',
    variables: {
      otp,
      company_logo_url: 'https://laundrease-public.s3.ap-south-1.amazonaws.com/images/laundrease-logo.PNG',
    },
  })
}