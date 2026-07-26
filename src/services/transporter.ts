import nodemailer from 'nodemailer'
import { env } from '../utils/env'

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.EMAIL_ID,
    pass: env.EMAIL_PASS,
  },
})

export async function sendEmail({ email: to, subject, html }: { email: string; subject: string; html: string }) {
  await transporter.sendMail({
    from: env.EMAIL_ID,
    subject,
    html,
    to,
  })
}
