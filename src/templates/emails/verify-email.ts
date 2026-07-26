import { type User } from 'better-auth'
import { sendEmail } from '../../services/transporter'
import { template } from './template'

export async function sendVerificationEmail({ user, url }: { user: User; url: string }) {
  await sendEmail({
    email: user.email,
    subject: 'Verify your email',
    html: template({
      content: `
      <p>Dear User,</p>
      <p>Thank you for joining! To ensure the security of your account, please verify your email address.</p>
      <p style="text-align: center;"><a href="${url}" class="cta-button" target="_blank">Verify Email</a></p>
      <p>If you didn't create an account with, please ignore this email or contact our support team if you have concerns.</p>`,
    }),
  })
}
