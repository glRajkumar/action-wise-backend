export type InviteEmailPayload = {
  email: string;
  workspaceName: string;
  token: string;
};

export interface InviteEmailSender {
  sendInviteEmail(payload: InviteEmailPayload): Promise<void>;
}

// Handover B: "email sending stubbed behind an interface with a
// console-logging implementation." Swap `inviteEmailSender` for a real
// nodemailer-backed implementation later without touching any call site.
const consoleInviteEmailSender: InviteEmailSender = {
  async sendInviteEmail({ email, workspaceName, token }) {
    console.log(`[invite-email] Invited ${email} to workspace "${workspaceName}". Accept token: ${token}`);
  },
};

export const inviteEmailSender: InviteEmailSender = consoleInviteEmailSender;
