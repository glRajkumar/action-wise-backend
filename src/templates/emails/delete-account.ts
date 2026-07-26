import { type User } from 'better-auth'
import { sendEmail } from '../../services/transporter';
import { template } from './template';

export async function sendDeleteAccountVerification({ user, url }: { user: User; url: string }) {
  await sendEmail({
    email: user.email,
    subject: 'Delete your account',
    html: template({
      content: `
<div>Dear User,</div>
<div>We're sorry to see you go! Please confirm your account deletion by clicking the button below:</div>
<a href="${url}">Confirm Deletion</a>
<div>If you did not request a account deletion, please ignore this email or contact our support team immediately.</div>
      `,
    }),
  })
}
