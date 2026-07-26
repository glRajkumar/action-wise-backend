import { type User } from 'better-auth'
import { sendEmail } from '../../services/transporter'
import { template } from './template'

export async function sendResetPassword({ user, url }: { user: User; url: string }) {
  await sendEmail({
    email: user.email,
    subject: 'Reset your password',
    html: template({
      content: `
<div>Dear User,</div>
<div>We received a request to reset your password. Please click the following button to proceed with resetting your password.</div>
<a href="${url}">Reset Password</a>
<div>If you did not request a password reset, please ignore this email or contact our support team immediately.</div>
      `,
    }),
  })
}
