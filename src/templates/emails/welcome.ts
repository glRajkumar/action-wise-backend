import { type User } from 'better-auth'
import { sendEmail } from '../../services/transporter'
import { template } from './template'

const product = 'Product name'

export async function welcomeEmail(user: Pick<User, 'email' | 'name'>) {
  await sendEmail({
    email: user.email,
    subject: `Welcome to ${product}`,
    html: template({
      headStyle: `
.welcome-message {
  margin-bottom: 30px;
}
.welcome-message h2 {
  color: #1f2937;
  font-size: 24px;
  margin-bottom: 16px;
  font-weight: 600;
}
.welcome-message p {
  color: #6b7280;
  font-size: 16px;
  margin-bottom: 16px;
}`,
      content: `
<div class="welcome-message">
  <h2>Welcome to Our Family! 🎉</h2>
  <p>Dear Valued Member,</p>
  <p>We're absolutely delighted to welcome you to ${product}! Thank you for choosing us.</p>
</div>
`,
    }),
  })
}
